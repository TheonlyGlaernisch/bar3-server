import {
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GatewayIntentBits,
  Guild,
  GuildMember,
  Interaction,
  REST,
  Routes,
  SlashCommandBuilder,
  TextChannel,
} from 'discord.js';
import { createServer, Server } from 'http';

import {
  API_KEY,
  API_PORT,
  ADMIN_DISCORD_IDS,
  BAR3_CLIENT_ROLE_ID,
  BAR3_SERVER_ROLE_ID,
  DISCORD_TOKEN,
  GUILD_ID,
  MONGODB_URI,
  PNW_API_KEY,
  PW_SCAN_API_KEY,
  VERIFIED_ROLE_ID,
} from './config';
import { createApp } from './api';
import { Database } from './database';
import {
  PNW_TEST_REST_URL,
  PnWClient,
  PnWSubscriptionClient,
  Nation,
  AllianceInfo,
  NationCreateDetail,
  NationWar,
  WarDetail,
  MAX_SOLDIERS_PER_CITY,
  MAX_TANKS_PER_CITY,
  MAX_AIRCRAFT_PER_CITY,
  MAX_SHIPS_PER_CITY,
  MAX_DEFENSIVE_SLOTS,
  calculateInfraCost,
  calculateCityCost,
  computeNationRevenue,
} from './pnw_api';
import { renderCommandHelp } from './commandDocs';

let primaryGuild: Guild | null = null;

const FUN_QUOTES: string[] = [
  `no bot will send
locutus has been faulty for some time

-# glaernischbot may hallucinate. please always refer to official sources`,
  `glaernischbot mention
try out the new / slash commands



over time, gasoline and alu might get more expensive, but so will all rss except steel, which is high already. uranium shows no signs of dropping, but raws might start hopping`,
  `fastreply glaernischbot: bool back online

-# please now reffer to official sources`,
  `nobody is real. everything is probably fake, becuz of your f****** senses`,
  `to confuse the enemy, you must first confuse yourself
    -sun zoo
-# -sirius`,
  `we wish you a merry christmas, and a happy ~~new year~~ lump of coal`,
];

function getPrimaryGuild(client: Client): Guild | null {
  if (primaryGuild) return primaryGuild;
  if (GUILD_ID !== null) {
    const byId = client.guilds.cache.get(String(GUILD_ID));
    if (byId) return (primaryGuild = byId);
  }
  return (primaryGuild = client.guilds.cache.first() ?? null);
}

function renderVerticalTierChart(rows: Array<[number, number]>, maxHeight = 8): string {
  if (!rows.length) return 'No tier data';
  const maxValue = Math.max(1, ...rows.map(([, count]) => count));
  const bars = rows.map(([tier, count]) => ({
    tier,
    count,
    height: Math.max(1, Math.round((count / maxValue) * maxHeight)),
  }));
  const lines: string[] = [];
  for (let y = maxHeight; y >= 1; y -= 1) {
    lines.push(bars.map((b) => (b.height >= y ? '█' : ' ')).join(' '));
  }
  lines.push(bars.map(() => '―').join(' '));
  lines.push(bars.map((b) => String(b.tier).padStart(2, '0')).join(' '));
  return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
}





const PNW_BASE_URL = 'https://politicsandwar.com';
const PNW_TEST_BASE_URL = 'https://test.politicsandwar.com';

function nationUrl(nationId: number, baseUrl = PNW_BASE_URL): string {
  return `${baseUrl}/nation/id=${nationId}/`;
}

function allianceUrl(allianceId: number, baseUrl = PNW_BASE_URL): string {
  return `${baseUrl}/alliance/id=${allianceId}`;
}

function warUrl(warId: number, baseUrl = PNW_BASE_URL): string {
  return `${baseUrl}/nation/war/timeline/war=${warId}`;
}

function hasRole(i: ChatInputCommandInteraction, roleId: number | null): boolean {
  if (!roleId || !i.inGuild() || !i.member) return false;
  const member = i.member as any;
  if (member?.roles?.cache) return member.roles.cache.has(String(roleId));
  if (Array.isArray(member?.roles)) return member.roles.includes(String(roleId));
  return false;
}

function hasBar3ClientAccess(i: ChatInputCommandInteraction): boolean {
  if (ADMIN_DISCORD_IDS.has(BigInt(i.user.id))) return true;
  return hasRole(i, BAR3_CLIENT_ROLE_ID);
}

type GovRoleKey = 'milcom' | 'milcom_gov' | 'econ' | 'econ_gov' | 'ia' | 'ia_asst' | 'gov' | 'leader' | '2ic' | 'member';

async function hasGovAccess(i: ChatInputCommandInteraction, db: Database, roleKeys: GovRoleKey[] = ['milcom']): Promise<boolean> {
  if (!i.inGuild() || !i.guildId || !i.member) return false;
  if (ADMIN_DISCORD_IDS.has(BigInt(i.user.id))) return true;
  const member = i.member;
  if ('permissions' in member && typeof member.permissions !== 'string' && member.permissions.has('Administrator')) return true;
  const cfg = await db.getGovRoles(BigInt(i.guildId));
  if (!('roles' in member) || !member.roles) return false;
  const roleSet = new Set((member.roles as { cache?: Map<string, unknown> }).cache ? Array.from((member.roles as any).cache.keys()) : (member.roles as any));
  for (const key of roleKeys) {
    const rid = (cfg as any)[key];
    if (rid != null && roleSet.has(String(rid))) return true;
  }
  return false;
}

/** Check whether the caller may use member-gated commands.
 * Passes if admin, the configured "member" role is unset, caller holds the
 * "member" role, or caller holds any gov role. */
async function hasMemberAccess(i: ChatInputCommandInteraction, db: Database): Promise<boolean> {
  if (!i.inGuild() || !i.guildId || !i.member) return false;
  if (ADMIN_DISCORD_IDS.has(BigInt(i.user.id))) return true;
  const member = i.member;
  if ('permissions' in member && typeof member.permissions !== 'string' && member.permissions.has('Administrator')) return true;
  const cfg = await db.getGovRoles(BigInt(i.guildId));
  const memberRoleId = (cfg as any)['member'];
  if (!memberRoleId) return true; // not configured — no restriction
  const roleSet = new Set(
    (member.roles as any)?.cache ? Array.from((member.roles as any).cache.keys()) : (member.roles as any) ?? [],
  );
  if (roleSet.has(String(memberRoleId))) return true;
  const govKeys: GovRoleKey[] = ['leader', '2ic', 'econ', 'econ_gov', 'milcom', 'milcom_gov', 'ia', 'ia_asst', 'gov'];
  for (const key of govKeys) {
    const rid = (cfg as any)[key];
    if (rid != null && roleSet.has(String(rid))) return true;
  }
  return false;
}

/** Render a welcome-message template into final message content. */
function renderWelcomeMessage(
  template: string,
  memberMention: string,
  memberName: string,
  isRegistered: boolean,
  welcomeChannelMention: string | null,
): string {
  const statusText = isRegistered
    ? `hmm, we seems to have met before ${memberName}, you have already been registered. GGs and cya`
    : 'alas, you dont seem registered with me. would you kindly run /register {nation id}?';
  return template
    .replace(/!\(user\)/g, memberMention)
    .replace(/!\(mention\)/g, memberMention)
    .replace(/!\(status\)/g, statusText)
    .replace(/!\(channel\)/g, welcomeChannelMention ?? '#unknown-channel');
}

/** Rich nation embed matching Python's _nation_embed. */
function nationEmbed(n: Nation, registeredDiscord?: string | null, note?: string | null, baseUrl = PNW_BASE_URL): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(n.nationName)
    .setURL(nationUrl(n.nationId, baseUrl))
    .setColor(0x3498DB);

  embed.addFields({ name: 'ID', value: String(n.nationId), inline: true });
  embed.addFields({ name: 'Leader', value: n.leaderName || '—', inline: true });

  // Alliance — hyperlinked with position and seniority
  let allianceVal: string;
  if (n.allianceId) {
    const label = n.allianceName || String(n.allianceId);
    allianceVal = `[${label}](${allianceUrl(n.allianceId, baseUrl)})`;
    const pos = n.alliancePosition;
    if (pos && pos !== 'NOALLIANCE') {
      const posTitle = pos.charAt(0).toUpperCase() + pos.slice(1).toLowerCase();
      let posLine = posTitle;
      if (n.allianceSeniority > 0) posLine += ` • ${Math.floor(n.allianceSeniority)}d`;
      allianceVal += `\n${posLine}`;
    }
  } else {
    allianceVal = 'None';
  }
  embed.addFields({ name: 'Alliance', value: allianceVal, inline: true });

  embed.addFields({ name: 'Score', value: n.score.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), inline: true });
  embed.addFields({ name: 'Cities', value: String(n.numCities), inline: true });
  if (n.rank) embed.addFields({ name: 'Rank', value: `#${n.rank.toLocaleString()}`, inline: true });
  if (n.continent) embed.addFields({ name: 'Continent', value: n.continent, inline: true });
  if (n.warPolicy) embed.addFields({ name: 'War Policy', value: n.warPolicy, inline: true });
  if (n.color) embed.addFields({ name: 'Color', value: n.color.charAt(0).toUpperCase() + n.color.slice(1).toLowerCase(), inline: true });

  if (n.offensiveWars || n.defensiveWars) {
    embed.addFields({ name: 'Wars', value: `⚔️ ${n.offensiveWars} off / 🛡️ ${n.defensiveWars} def`, inline: true });
  }
  embed.addFields({ name: 'War Record', value: `🏆 ${n.warsWon.toLocaleString()} won / 💀 ${n.warsLost.toLocaleString()} lost`, inline: true });

  const projectsValue = n.projectsBuilt.length ? `${n.numProjects} — ${n.projectsBuilt.join(', ')}` : '0';
  embed.addFields({ name: 'Projects', value: projectsValue, inline: false });

  // Average infrastructure estimate from score formula
  if (n.numCities > 0) {
    const militaryScore = n.soldiers * 0.0004 + n.tanks * 0.025 + n.aircraft * 0.3 + n.ships * 1.0 + n.missiles * 5.0 + n.nukes * 15.0;
    const infraScore = n.score - (n.numCities - 1) * 100 - 10 - n.numProjects * 20 - militaryScore;
    const avgInfra = infraScore * 40 / n.numCities;
    embed.addFields({ name: 'Avg Infra', value: avgInfra.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), inline: true });
  }

  if (n.lastActiveUnix) {
    embed.addFields({ name: 'Last Active', value: `<t:${n.lastActiveUnix}:R>`, inline: true });
  } else if (n.lastActive) {
    embed.addFields({ name: 'Last Active', value: n.lastActive, inline: true });
  }

  // Military capacity percentages
  if (n.numCities > 0) {
    const maxSol = MAX_SOLDIERS_PER_CITY * n.numCities;
    const maxTan = MAX_TANKS_PER_CITY * n.numCities;
    const maxAir = MAX_AIRCRAFT_PER_CITY * n.numCities;
    const maxShi = MAX_SHIPS_PER_CITY * n.numCities;
    const pct = (val: number, cap: number) =>
      cap === 0 ? `${val.toLocaleString()} (—)` : `${val.toLocaleString()} (${((val / cap) * 100).toFixed(1)}%)`;
    const militaryText = [
      `🪖 Soldiers: ${pct(n.soldiers, maxSol)}`,
      `⚔️ Tanks:    ${pct(n.tanks, maxTan)}`,
      `✈️ Aircraft: ${pct(n.aircraft, maxAir)}`,
      `🚢 Ships:    ${pct(n.ships, maxShi)}`,
      `🚀 Missiles: ${n.missiles.toLocaleString()}`,
      `☢️ Nukes:    ${n.nukes.toLocaleString()}`,
    ].join('\n');
    embed.addFields({ name: 'Military', value: militaryText, inline: false });
  }

  if (registeredDiscord) {
    embed.addFields({ name: 'Discord', value: registeredDiscord, inline: true });
  } else if (n.discordTag) {
    embed.addFields({ name: 'PnW Discord', value: `\`${n.discordTag}\``, inline: true });
  }

  if (note) embed.setFooter({ text: note });

  return embed;
}

/** Rich alliance embed matching Python's _alliance_embed. */
function allianceEmbed(info: AllianceInfo, baseUrl = PNW_BASE_URL): EmbedBuilder {
  const title = info.acronym ? `${info.name} (${info.acronym})` : info.name;
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setURL(allianceUrl(info.allianceId, baseUrl))
    .setColor(0xF1C40F);

  if (info.flag) embed.setThumbnail(info.flag);

  embed.addFields({ name: 'ID', value: String(info.allianceId), inline: true });
  embed.addFields({ name: 'Score', value: info.score.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), inline: true });
  embed.addFields({ name: 'Avg Score', value: info.averageScore.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), inline: true });
  embed.addFields({ name: 'Color', value: info.color ? info.color.charAt(0).toUpperCase() + info.color.slice(1).toLowerCase() : '—', inline: true });
  embed.addFields({ name: 'Members', value: String(info.numMembers), inline: true });
  embed.addFields({ name: 'Applicants', value: String(info.numApplicants), inline: true });
  if (info.rank) embed.addFields({ name: 'Rank', value: `#${info.rank}`, inline: true });
  if (info.totalCities) embed.addFields({ name: 'Total Cities', value: String(info.totalCities), inline: true });
  embed.addFields({ name: 'Avg Cities', value: info.avgCities.toFixed(1), inline: true });
  if (info.discordLink) embed.addFields({ name: 'Discord', value: `[Join Server](${info.discordLink})`, inline: true });

  return embed;
}

/** Build an active-wars embed for /whois "Show Wars" button. */
function buildActiveWarsEmbed(nation: Nation, wars: NationWar[], baseUrl = PNW_BASE_URL): EmbedBuilder {
  const lines: string[] = [];
  for (let i = 0; i < wars.length; i++) {
    const w = wars[i]!;
    const isAttacker = w.attackerId === nation.nationId;
    const oppId = isAttacker ? w.defenderId : w.attackerId;
    const oppName = isAttacker ? w.defenderName : w.attackerName;
    const side = isAttacker ? 'Attacking' : 'Defending';
    lines.push(`\`${String(i + 1).padStart(2)}\`. [${oppName}](${nationUrl(oppId, baseUrl)}) — ${side} · [War #${w.warId}](${warUrl(w.warId, baseUrl)})`);
  }
  return new EmbedBuilder()
    .setTitle(`⚔️ Active Wars — ${nation.nationName}`)
    .setDescription(lines.join('\n') || '*(no active wars)*')
    .setColor(0xE67E22)
    .setFooter({ text: `${wars.length} active war(s)` });
}

async function handleRegister(i: ChatInputCommandInteraction, db: Database, pnw: PnWClient): Promise<void> {
  await i.deferReply();
  const nationId = i.options.getInteger('nation_id', true);
  if (nationId <= 0) {
    await i.followUp({ embeds: [new EmbedBuilder().setDescription('❌ Please provide a valid positive nation ID.').setColor(0xE74C3C)] });
    return;
  }

  // Check if this nation is already registered to a different user
  const existingByNation = await db.getByNationId(nationId);
  if (existingByNation && BigInt(existingByNation.discord_id) !== BigInt(i.user.id)) {
    await i.followUp({ embeds: [new EmbedBuilder().setDescription('❌ That nation is already registered to a different Discord account.').setColor(0xE74C3C)] });
    return;
  }

  let nation: Nation | null;
  try {
    nation = await pnw.getNation(nationId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await i.followUp({ embeds: [new EmbedBuilder().setDescription(`❌ Could not reach the Politics and War API: ${msg}`).setColor(0xE74C3C)] });
    return;
  }

  if (!nation) {
    await i.followUp({ embeds: [new EmbedBuilder().setDescription(`❌ Nation with ID **${nationId}** was not found.`).setColor(0xE74C3C)] });
    return;
  }

  const discordName = i.user.username;
  if (!PnWClient.discordMatches(nation.discordTag, discordName)) {
    await i.followUp({
      embeds: [new EmbedBuilder().setDescription(
        `❌ Verification failed.\n\nNation **${nation.nationName}** (leader: ${nation.leaderName}) ` +
        `has \`${nation.discordTag || '(empty)'}\` as its Discord handle, ` +
        `but your Discord username is \`${discordName}\`.\n\n` +
        `Please set your Discord handle on your nation's edit page to \`${discordName}\` and try again.`
      ).setColor(0xE74C3C)],
    });
    return;
  }

  await db.register(BigInt(i.user.id), nationId, discordName);

  // Assign VERIFIED_ROLE_ID if configured
  const roleMentions: string[] = [];
  if (i.guild && VERIFIED_ROLE_ID) {
    const member = i.guild.members.cache.get(i.user.id) as GuildMember | undefined;
    if (member) {
      const role = i.guild.roles.cache.get(String(VERIFIED_ROLE_ID));
      if (role && !member.roles.cache.has(String(VERIFIED_ROLE_ID))) {
        try {
          await member.roles.add(role, 'flame_bot: /register');
          roleMentions.push(role.toString());
        } catch { /* missing permissions — ignore */ }
      }
    }
  }

  const rolesText = roleMentions.length ? `\n\nYou have been given: ${roleMentions.join(', ')}` : '';
  await i.followUp({
    embeds: [new EmbedBuilder().setDescription(
      `✅ Successfully registered!\nNation: **${nation.nationName}** (ID: \`${nationId}\`, leader: ${nation.leaderName})${rolesText}`
    ).setColor(0x2ECC71)],
  });
}

async function handleWhois(i: ChatInputCommandInteraction, db: Database, pnw: PnWClient, pnwTest: PnWClient, useTest = false): Promise<void> {
  const query = i.options.getString('query', true).trim();
  const client = useTest ? pnwTest : pnw;
  let nation = /^\d+$/.test(query) ? await client.getNation(parseInt(query, 10)) : await client.getNationByName(query);
  if (!nation && /^<@!?\d+>$/.test(query)) {
    const id = BigInt(query.replace(/\D/g, ''));
    const row = await db.getByDiscordId(id);
    if (row) nation = await client.getNation(Number(row.nation_id));
  }
  if (!nation) {
    const row = await db.getByDiscordUsername(query);
    if (row) nation = await client.getNation(Number(row.nation_id));
  }
  if (!nation) return void i.reply({ content: 'No matching nation found.', ephemeral: true });
  await i.reply({ embeds: [nationEmbed(nation)] });
}

async function handleAllianceInfo(i: ChatInputCommandInteraction, pnw: PnWClient, useTest = false): Promise<void> {
  const query = i.options.getString('query', true).trim();
  const client = useTest ? new PnWClient(PNW_API_KEY, { restUrl: PNW_TEST_REST_URL }) : pnw;
  const alliance = /^\d+$/.test(query)
    ? await client.getAllianceById(parseInt(query, 10))
    : await client.getAllianceByName(query);
  if (!alliance) return void i.reply({ content: 'Alliance not found.', ephemeral: true });
  await i.reply({
    embeds: [new EmbedBuilder().setTitle(`${alliance.name} (${alliance.allianceId})`).addFields(
      { name: 'Acronym', value: alliance.acronym || 'N/A', inline: true },
      { name: 'Members', value: String(alliance.numMembers), inline: true },
      { name: 'Score', value: alliance.score.toFixed(2), inline: true },
      { name: 'Avg Cities', value: alliance.avgCities.toFixed(2), inline: true },
      { name: 'Color', value: alliance.color || 'N/A', inline: true },
    )],
  });
}



async function handleAllianceMembers(i: ChatInputCommandInteraction, pnw: PnWClient, useTest = false): Promise<void> {
  const query = i.options.getString('query', true).trim();
  const client = useTest ? new PnWClient(PNW_API_KEY, { restUrl: PNW_TEST_REST_URL }) : pnw;
  const alliance = /^\d+$/.test(query)
    ? await client.getAllianceById(parseInt(query, 10))
    : await client.getAllianceByName(query);
  if (!alliance) return void i.reply({ content: 'Alliance not found.', ephemeral: true });
  const members = await client.getAllianceMembers([alliance.allianceId]);
  const sorted = members.sort((a, b) => b.score - a.score);
  const pageSize = 10;
  let page = 0;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));

  const render = (): EmbedBuilder => {
    const chunk = sorted.slice(page * pageSize, page * pageSize + pageSize);
    const desc = chunk.map((m, idx) => `${page * pageSize + idx + 1}. **${m.nationName}** (${m.nationId}) — Score ${m.score.toFixed(2)}, Cities ${m.numCities}`).join('\n') || 'No members found.';
    return new EmbedBuilder().setTitle(`${alliance.name} members`).setDescription(desc).setFooter({ text: `Page ${page + 1}/${totalPages}` });
  };

  const row = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
  );

  const msg = await i.reply({ embeds: [render()], components: totalPages > 1 ? [row()] : [], fetchReply: true });
  if (totalPages <= 1) return;
  const collector = msg.createMessageComponentCollector({ time: 120_000 });
  collector.on('collect', async (btn) => {
    if (btn.user.id !== i.user.id) {
      await btn.reply({ content: 'Only the command caller can paginate this view.', ephemeral: true });
      return;
    }
    if (btn.customId === 'prev' && page > 0) page -= 1;
    if (btn.customId === 'next' && page < totalPages - 1) page += 1;
    await btn.update({ embeds: [render()], components: [row()] });
  });
  collector.on('end', async () => {
    try { await i.editReply({ components: [] }); } catch { /**/ }
  });
}

async function handleSlots(i: ChatInputCommandInteraction, db: Database, pnw: PnWClient): Promise<void> {
  if (!i.guildId) return void i.reply({ content: 'Guild only command.', ephemeral: true });
  const allianceIds = await db.getSlotsAlliances(BigInt(i.guildId));
  if (!allianceIds.length) return void i.reply({ content: 'No slot alliances configured.', ephemeral: true });
  const members = await pnw.getAllianceMembers(allianceIds);
  const lines = members
    .filter((m) => !m.beigeTurns)
    .sort((a, b) => (b.defensiveWars - a.defensiveWars) || (b.score - a.score))
    .slice(0, 30)
    .map((m) => `**${m.nationName}** (${m.nationId}) — score ${m.score.toFixed(2)} | cities ${m.numCities} | open slots ${Math.max(0, 3 - m.defensiveWars)}`);
  await i.reply({ embeds: [new EmbedBuilder().setTitle('Open defensive slots').setDescription(lines.join('\n') || 'No eligible nations found.')] });
}



function buildWarAlertEmbed(war: WarDetail, watchedAllianceId: number): EmbedBuilder {
  const isAttacker = war.attackerAllianceId === watchedAllianceId;
  const own = isAttacker
    ? { n: war.attackerName, id: war.attackerId, score: war.attackerScore, c: war.attackerCities, aa: war.attackerAllianceName }
    : { n: war.defenderName, id: war.defenderId, score: war.defenderScore, c: war.defenderCities, aa: war.defenderAllianceName };
  const opp = isAttacker
    ? { n: war.defenderName, id: war.defenderId, score: war.defenderScore, c: war.defenderCities, aa: war.defenderAllianceName }
    : { n: war.attackerName, id: war.attackerId, score: war.attackerScore, c: war.attackerCities, aa: war.attackerAllianceName };
  return new EmbedBuilder()
    .setTitle(`War Alert: ${own.n} vs ${opp.n}`)
    .setDescription(`Type: **${war.warType}**`)
    .addFields(
      { name: 'Our nation', value: `${own.n} (${own.id})
AA: ${own.aa}
Score: ${own.score.toFixed(2)} | Cities: ${own.c}` },
      { name: 'Opponent', value: `${opp.n} (${opp.id})
AA: ${opp.aa}
Score: ${opp.score.toFixed(2)} | Cities: ${opp.c}` },
    )
    .setTimestamp(war.date)
    .setColor(0xff3b30);
}

async function main(): Promise<void> {
  const db = new Database(MONGODB_URI);
  await db.connect();
  const pnw = new PnWClient(PNW_API_KEY);
  const pnwTest = new PnWClient(PNW_API_KEY, { restUrl: PNW_TEST_REST_URL });

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  const commandUsage = new Map<string, number>();
  const commands = [
    new SlashCommandBuilder().setName('register').setDescription('Register your nation').addIntegerOption(o => o.setName('nation_id').setDescription('Nation ID').setRequired(true)),
    new SlashCommandBuilder().setName('unregister').setDescription('Unregister your nation'),
    new SlashCommandBuilder().setName('whois').setDescription('Lookup nation by id/name/@mention').addStringOption(o => o.setName('query').setDescription('Search query').setRequired(true)),
    new SlashCommandBuilder().setName('test_whois').setDescription('Lookup nation on test API').addStringOption(o => o.setName('query').setDescription('Search query').setRequired(true)),
    new SlashCommandBuilder().setName('alliance_info').setDescription('Lookup alliance').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)),
    new SlashCommandBuilder().setName('test_alliance_info').setDescription('Lookup alliance on test API').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)),
    new SlashCommandBuilder().setName('alliance_members').setDescription('List alliance members').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)),
    new SlashCommandBuilder().setName('test_alliance_members').setDescription('List alliance members (test API)').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)),
    new SlashCommandBuilder().setName('config_slots_set').setDescription('Set slot alliance IDs (comma-separated)').addStringOption(o => o.setName('alliance_ids').setDescription('e.g. 790,1234').setRequired(true)),
    new SlashCommandBuilder().setName('config_slots_show').setDescription('Show configured slot alliance IDs'),
    new SlashCommandBuilder().setName('config_slots_clear').setDescription('Clear configured slot alliance IDs'),
    new SlashCommandBuilder().setName('slots').setDescription('Show open defensive slots for configured alliances'),
    new SlashCommandBuilder().setName('setup_war_alerts_add').setDescription('Add war alerts subscription').addChannelOption(o => o.setName('channel').setDescription('Target text channel').setRequired(true)).addIntegerOption(o => o.setName('min_cities').setDescription('Minimum cities')).addIntegerOption(o => o.setName('max_cities').setDescription('Maximum cities')),
    new SlashCommandBuilder().setName('setup_war_alerts_remove').setDescription('Remove war alerts subscription').addChannelOption(o => o.setName('channel').setDescription('Target text channel').setRequired(true)),
    new SlashCommandBuilder().setName('setup_war_alerts_list').setDescription('List war alerts subscriptions'),
    new SlashCommandBuilder().setName('send').setDescription('Compose transfer command').addStringOption(o => o.setName('receiver').setDescription('Nation ID or @mention').setRequired(true)).addStringOption(o => o.setName('sender').setDescription('Optional sender nation ID')).addStringOption(o => o.setName('bank_note').setDescription('Bank note')).addNumberOption(o => o.setName('money').setDescription('Money amount')).addNumberOption(o => o.setName('food').setDescription('Food amount')).addNumberOption(o => o.setName('coal').setDescription('Coal amount')).addNumberOption(o => o.setName('oil').setDescription('Oil amount')).addNumberOption(o => o.setName('uranium').setDescription('Uranium amount')).addNumberOption(o => o.setName('iron').setDescription('Iron amount')).addNumberOption(o => o.setName('bauxite').setDescription('Bauxite amount')).addNumberOption(o => o.setName('lead').setDescription('Lead amount')).addNumberOption(o => o.setName('gasoline').setDescription('Gasoline amount')).addNumberOption(o => o.setName('munitions').setDescription('Munitions amount')).addNumberOption(o => o.setName('steel').setDescription('Steel amount')).addNumberOption(o => o.setName('aluminum').setDescription('Aluminum amount')),
    new SlashCommandBuilder().setName('suggestion').setDescription('Send suggestion to dev').addStringOption(o => o.setName('content').setDescription('Suggestion text').setRequired(true)),
    new SlashCommandBuilder().setName('roles_show').setDescription('Show configured gov role mappings'),
    new SlashCommandBuilder().setName('roles_setup').setDescription('Configure gov roles').addRoleOption(o => o.setName('econ').setDescription('Economics role')).addRoleOption(o => o.setName('milcom').setDescription('Military command role')).addRoleOption(o => o.setName('ia').setDescription('Internal affairs role')).addRoleOption(o => o.setName('gov').setDescription('Basic gov role')).addRoleOption(o => o.setName('econ_gov').setDescription('Economics gov role')),
    new SlashCommandBuilder().setName('gov').setDescription('List members in configured gov departments'),
    new SlashCommandBuilder().setName('setup_grant_channel').setDescription('Set grant request channel').addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true)),
    new SlashCommandBuilder().setName('request_grant').setDescription('Request a grant').addStringOption(o => o.setName('note').setDescription('Grant reason').setRequired(true)).addNumberOption(o => o.setName('money').setDescription('Requested money')).addNumberOption(o => o.setName('food').setDescription('Food amount')).addNumberOption(o => o.setName('coal').setDescription('Coal amount')).addNumberOption(o => o.setName('oil').setDescription('Oil amount')).addNumberOption(o => o.setName('uranium').setDescription('Uranium amount')).addNumberOption(o => o.setName('iron').setDescription('Iron amount')).addNumberOption(o => o.setName('bauxite').setDescription('Bauxite amount')).addNumberOption(o => o.setName('lead').setDescription('Lead amount')).addNumberOption(o => o.setName('gasoline').setDescription('Gasoline amount')).addNumberOption(o => o.setName('munitions').setDescription('Munitions amount')).addNumberOption(o => o.setName('steel').setDescription('Steel amount')).addNumberOption(o => o.setName('aluminum').setDescription('Aluminum amount')),
    new SlashCommandBuilder().setName('admin_alliance_set').setDescription('Set guild primary alliance ID').addIntegerOption(o => o.setName('alliance_id').setDescription('Alliance ID').setRequired(true)),
    new SlashCommandBuilder().setName('admin_alliance_show').setDescription('Show guild primary alliance ID'),
    new SlashCommandBuilder().setName('color').setDescription('Check alliance color compliance'),
    new SlashCommandBuilder().setName('damage_leaderboard').setDescription('Show 7-day alliance damage leaderboard'),
    new SlashCommandBuilder().setName('alliance_lots_of_info').setDescription('Detailed alliance briefing').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)),
    new SlashCommandBuilder().setName('test_alliance_lots_of_info').setDescription('Detailed alliance briefing (test API)').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)),
    new SlashCommandBuilder().setName('fun_quote').setDescription('Get a random quote'),

    new SlashCommandBuilder().setName('welcome_set').setDescription('Set welcome message text').addStringOption(o => o.setName('message').setDescription('Welcome template').setRequired(true)),
    new SlashCommandBuilder().setName('welcome_channel_set').setDescription('Set welcome channel').addChannelOption(o => o.setName('channel').setDescription('Welcome channel').setRequired(true)),
    new SlashCommandBuilder().setName('welcome_enable').setDescription('Enable welcome messages'),
    new SlashCommandBuilder().setName('welcome_disable').setDescription('Disable welcome messages'),
    new SlashCommandBuilder().setName('welcome_show').setDescription('Show welcome config'),
    new SlashCommandBuilder().setName('setup_recruiter_add').setDescription('Add recruiter subscription channel').addChannelOption(o => o.setName('channel').setDescription('Text channel').setRequired(true)),
    new SlashCommandBuilder().setName('setup_recruiter_remove').setDescription('Remove recruiter subscription channel').addChannelOption(o => o.setName('channel').setDescription('Text channel').setRequired(true)),
    new SlashCommandBuilder().setName('setup_recruiter_list').setDescription('List recruiter subscription channels'),
    new SlashCommandBuilder().setName('admin_api_key_set').setDescription('Set runtime PnW API key').addStringOption(o => o.setName('api_key').setDescription('PnW API key').setRequired(true)),
    new SlashCommandBuilder().setName('help').setDescription('Show bot command help'),
    new SlashCommandBuilder().setName('infra').setDescription('Calculate infra purchase cost').addNumberOption(o => o.setName('from').setDescription('Current infra').setRequired(true)).addNumberOption(o => o.setName('to').setDescription('Target infra').setRequired(true)).addIntegerOption(o => o.setName('cities').setDescription('Number of cities').setRequired(true)),
    new SlashCommandBuilder().setName('city_cost').setDescription('Calculate city purchase cost').addIntegerOption(o => o.setName('current').setDescription('Current city count').setRequired(true)).addIntegerOption(o => o.setName('target').setDescription('Target city count').setRequired(true)),
    new SlashCommandBuilder().setName('revenue').setDescription('Estimate nation daily revenue').addIntegerOption(o => o.setName('nation_id').setDescription('Nation ID').setRequired(true)),
    new SlashCommandBuilder().setName('war_range_targets').setDescription('Show slotter alliance targets and highlight war range'),
    new SlashCommandBuilder().setName('spy_target_find').setDescription('Show slotter alliance targets and highlight spy range'),
    new SlashCommandBuilder().setName('missile_targets_find').setDescription('Show slotter alliance targets and highlight missile range'),
    new SlashCommandBuilder().setName('admin_sync_commands').setDescription('Sync slash commands now'),
    new SlashCommandBuilder().setName('admin_clear_guild_commands').setDescription('Clear guild-scoped commands'),

  ].map(c => c.toJSON());

  client.once('ready', async () => {
    console.log(`Logged in as ${client.user?.tag ?? 'unknown'}`);
    const appId = client.application?.id;
    if (!appId) return;
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    if (GUILD_ID !== null) {
      await rest.put(Routes.applicationGuildCommands(appId, String(GUILD_ID)), { body: commands });
    } else {
      await rest.put(Routes.applicationCommands(appId), { body: commands });
    }
    console.log('Slash commands synced.');
  });

  client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    commandUsage.set(interaction.commandName, (commandUsage.get(interaction.commandName) ?? 0) + 1);
    try {
      if (interaction.commandName === 'register') {
        return await handleRegister(interaction, db, pnw);
      }
      if (interaction.commandName === 'unregister') {
        const deleted = await db.delete(BigInt(interaction.user.id));
        return void interaction.reply({ content: deleted ? 'Unregistered.' : 'No registration found.', ephemeral: true });
      }
      if (interaction.commandName === 'whois') return await handleWhois(interaction, db, pnw, pnwTest, false);
      if (interaction.commandName === 'test_whois') return await handleWhois(interaction, db, pnw, pnwTest, true);
      if (interaction.commandName === 'alliance_info') return await handleAllianceInfo(interaction, pnw, false);
      if (interaction.commandName === 'test_alliance_info') return await handleAllianceInfo(interaction, pnw, true);
      if (interaction.commandName === 'alliance_members') return await handleAllianceMembers(interaction, pnw, false);
      if (interaction.commandName === 'test_alliance_members') return await handleAllianceMembers(interaction, pnw, true);
      if (interaction.commandName === 'slots') return await handleSlots(interaction, db, pnw);

      if (interaction.commandName === 'config_slots_set') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        if (!await hasGovAccess(interaction, db, ['milcom','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', ephemeral: true });
        const raw = interaction.options.getString('alliance_ids', true);
        const ids = raw.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
        if (!ids.length) return void interaction.reply({ content: 'No valid alliance IDs provided.', ephemeral: true });
        await db.setSlotsAlliances(BigInt(interaction.guildId), ids);
        return void interaction.reply({ content: `Configured slots alliances: ${ids.join(', ')}` });
      }
      if (interaction.commandName === 'config_slots_show') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        const ids = await db.getSlotsAlliances(BigInt(interaction.guildId));
        return void interaction.reply({ content: ids.length ? `Configured slots alliances: ${ids.join(', ')}` : 'No slot alliances configured.', ephemeral: true });
      }
      if (interaction.commandName === 'config_slots_clear') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        if (!await hasGovAccess(interaction, db, ['milcom','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', ephemeral: true });
        await db.setSlotsAlliances(BigInt(interaction.guildId), []);
        return void interaction.reply({ content: 'Cleared slot alliances.' });
      }

      if (interaction.commandName === 'setup_war_alerts_add') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        if (!await hasGovAccess(interaction, db, ['milcom','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', ephemeral: true });
        const channel = interaction.options.getChannel('channel', true);
        const minCities = interaction.options.getInteger('min_cities');
        const maxCities = interaction.options.getInteger('max_cities');
        await db.addWarAlertSubscription(BigInt(interaction.guildId), BigInt(channel.id), minCities, maxCities);
        return void interaction.reply({ content: `War alerts enabled for <#${channel.id}> (${minCities ?? 'any'}-${maxCities ?? 'any'} cities).` });
      }
      if (interaction.commandName === 'setup_war_alerts_remove') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        if (!await hasGovAccess(interaction, db, ['milcom','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', ephemeral: true });
        const channel = interaction.options.getChannel('channel', true);
        const removed = await db.removeWarAlertSubscription(BigInt(interaction.guildId), BigInt(channel.id));
        return void interaction.reply({ content: removed ? `War alerts removed from <#${channel.id}>.` : `No subscription found for <#${channel.id}>.`, ephemeral: true });
      }
      if (interaction.commandName === 'setup_war_alerts_list') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        const subs = await db.getWarAlertSubscriptions(BigInt(interaction.guildId));
        const lines = subs.map((row) => `• <#${row.channel_id}> cities ${row.min_cities ?? 'any'}-${row.max_cities ?? 'any'}`);
        return void interaction.reply({ content: lines.length ? lines.join('\n') : 'No war alert subscriptions configured.', ephemeral: true });
      }

      if (interaction.commandName === 'send') {
        const receiverRaw = interaction.options.getString('receiver', true).trim();
        let receiver = receiverRaw.replace(/\D/g, '');
        if (!receiver) {
          const row = await db.getByDiscordUsername(receiverRaw);
          if (row) receiver = String(row.nation_id);
        }
        if (!receiver) return void interaction.reply({ content: 'Could not resolve receiver nation ID.', ephemeral: true });

        const sender = interaction.options.getString('sender')?.trim() ?? '';
        const bankNoteInput = interaction.options.getString('bank_note') ?? '#grant';
        const bankNote = bankNoteInput.startsWith('#') ? bankNoteInput : `#${bankNoteInput}`;

        const resources: Record<string, number> = {
          money: interaction.options.getNumber('money') ?? 0,
          food: interaction.options.getNumber('food') ?? 0,
          coal: interaction.options.getNumber('coal') ?? 0,
          oil: interaction.options.getNumber('oil') ?? 0,
          uranium: interaction.options.getNumber('uranium') ?? 0,
          iron: interaction.options.getNumber('iron') ?? 0,
          bauxite: interaction.options.getNumber('bauxite') ?? 0,
          lead: interaction.options.getNumber('lead') ?? 0,
          gasoline: interaction.options.getNumber('gasoline') ?? 0,
          munitions: interaction.options.getNumber('munitions') ?? 0,
          steel: interaction.options.getNumber('steel') ?? 0,
          aluminum: interaction.options.getNumber('aluminum') ?? 0,
        };
        const transferItems = Object.entries(resources)
          .filter(([,v]) => v && v > 0)
          .map(([k,v]) => `${k}:${Math.trunc(v)}`)
          .join(', ');
        const cmd = `/transfer resources receiver:${receiver} transfer:{ ${transferItems || 'money:0'} } bank_note:${bankNote}` + (sender ? ` sender:${sender}` : '');
        const summary = Object.entries(resources).filter(([,v]) => v && v > 0).map(([k,v]) => `${k}: ${Math.trunc(v).toLocaleString()}`).join('\n') || 'No resources specified';

        return void interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Transfer command')
              .setDescription(`Receiver: ${receiver}\nSender: ${sender || '(default)'}\nBank note: ${bankNote}\n\n${summary}\n\n\`\`\`${cmd}\`\`\``),
          ],
        });
      }

      if (interaction.commandName === 'suggestion') {
        const content = interaction.options.getString('content', true);
        console.log(`Suggestion from ${interaction.user.id}: ${content}`);
        return void interaction.reply({ content: 'Suggestion recorded. Thank you!', ephemeral: true });
      }


      if (interaction.commandName === 'roles_setup') {
        if (!interaction.guildId || !interaction.guild) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        if (!await hasGovAccess(interaction, db, ['leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', ephemeral: true });
        const current = await db.getGovRoles(BigInt(interaction.guildId));
        const fields: Array<'econ'|'milcom'|'ia'|'gov'|'econ_gov'> = ['econ','milcom','ia','gov','econ_gov'];
        for (const key of fields) {
          const role = interaction.options.getRole(key);
          if (role) (current as any)[key] = Number(role.id);
        }
        await db.setGovRoles(BigInt(interaction.guildId), current as any);
        return void interaction.reply({ content: 'Updated gov role mappings.' });
      }
      if (interaction.commandName === 'gov') {
        if (!interaction.guildId || !interaction.guild) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        const cfg = await db.getGovRoles(BigInt(interaction.guildId));
        const departments: Array<[string, keyof typeof cfg]> = [
          ['Economics', 'econ'],
          ['Military Command', 'milcom'],
          ['Internal Affairs', 'ia'],
          ['Basic Gov', 'gov'],
        ];
        const lines: string[] = [];
        for (const [name, key] of departments) {
          const rid = cfg[key];
          if (!rid) {
            lines.push(`**${name}:** not configured`);
            continue;
          }
          const role = interaction.guild.roles.cache.get(String(rid));
          const members = role ? role.members.map((m) => `<@${m.id}>`).join(', ') : '';
          lines.push(`**${name}:** ${members || 'no members'}`);
        }
        return void interaction.reply({ embeds: [new EmbedBuilder().setTitle('Government roster').setDescription(lines.join('\n\n'))] });
      }

      if (interaction.commandName === 'roles_show') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        const roles = await db.getGovRoles(BigInt(interaction.guildId));
        const text = Object.entries(roles).map(([k,v]) => `• ${k}: ${v ? `<@&${v}>` : 'not set'}`).join('\n');
        return void interaction.reply({ embeds: [new EmbedBuilder().setTitle('Configured gov roles').setDescription(text)] , ephemeral: true});
      }
      if (interaction.commandName === 'setup_grant_channel') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        if (!await hasGovAccess(interaction, db, ['econ','ia','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', ephemeral: true });
        const ch = interaction.options.getChannel('channel', true);
        await db.setGrantChannel(BigInt(interaction.guildId), Number(ch.id));
        return void interaction.reply({ content: `Grant channel set to <#${ch.id}>.` });
      }
      if (interaction.commandName === 'request_grant') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        const note = interaction.options.getString('note', true);
        const resources: Record<string, number> = {
          money: interaction.options.getNumber('money') ?? 0,
          food: interaction.options.getNumber('food') ?? 0,
          coal: interaction.options.getNumber('coal') ?? 0,
          oil: interaction.options.getNumber('oil') ?? 0,
          uranium: interaction.options.getNumber('uranium') ?? 0,
          iron: interaction.options.getNumber('iron') ?? 0,
          bauxite: interaction.options.getNumber('bauxite') ?? 0,
          lead: interaction.options.getNumber('lead') ?? 0,
          gasoline: interaction.options.getNumber('gasoline') ?? 0,
          munitions: interaction.options.getNumber('munitions') ?? 0,
          steel: interaction.options.getNumber('steel') ?? 0,
          aluminum: interaction.options.getNumber('aluminum') ?? 0,
        };
        const grantChannelId = await db.getGrantChannel(BigInt(interaction.guildId));
        if (!grantChannelId) return void interaction.reply({ content: 'Grant channel is not configured.', ephemeral: true });
        const guild = interaction.guild;
        const ch = guild?.channels.cache.get(String(grantChannelId)) as TextChannel | undefined;
        if (!ch) return void interaction.reply({ content: 'Configured grant channel not found.', ephemeral: true });
        const govRoles = await db.getGovRoles(BigInt(interaction.guildId));
        const pingRole = govRoles.econ_gov ?? govRoles.econ;
        const bankNote = note.startsWith('#') ? note : `#${note.replace(/\s+/g,'_')}`;
        const transferItems = Object.entries(resources)
          .filter(([,v]) => v && v > 0)
          .map(([k,v]) => `${k}:${Math.trunc(v)}`)
          .join(', ');
        const transferCmd = `/transfer resources receiver:${interaction.user.id} transfer:{ ${transferItems || 'money:0'} } bank_note:${bankNote}`;
        const resourceLines = Object.entries(resources).filter(([,v]) => v && v > 0).map(([k,v]) => `${k}: ${Math.trunc(v).toLocaleString()}`).join('\n') || 'No resources specified';
        await ch.send({
          content: pingRole ? `<@&${pingRole}>` : undefined,
          embeds: [new EmbedBuilder().setTitle('Grant request').setDescription(`From: <@${interaction.user.id}>
Reason: ${note}

${resourceLines}

\`\`\`${transferCmd}\`\`\``)],
        });
        return void interaction.reply({ content: `Grant request submitted in <#${grantChannelId}>.`, ephemeral: true });
      }

      if (interaction.commandName === 'admin_alliance_set') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        if (!await hasGovAccess(interaction, db, ['leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', ephemeral: true });
        const allianceId = interaction.options.getInteger('alliance_id', true);
        await db.setAllianceId(BigInt(interaction.guildId), allianceId);
        return void interaction.reply({ content: `Primary alliance set to ${allianceId}.` });
      }
      if (interaction.commandName === 'admin_alliance_show') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        const allianceId = await db.getAllianceId(BigInt(interaction.guildId));
        return void interaction.reply({ content: allianceId ? `Primary alliance: ${allianceId}` : 'No primary alliance configured.', ephemeral: true });
      }



      if (interaction.commandName === 'alliance_lots_of_info') {
        const query = interaction.options.getString('query', true).trim();
        const alliance = /^\d+$/.test(query)
          ? await pnw.getAllianceById(parseInt(query, 10))
          : await pnw.getAllianceByName(query);
        if (!alliance) return void interaction.reply({ content: 'Alliance not found.', ephemeral: true });
        const members = await pnw.getAllianceMembers([alliance.allianceId]);
        const tierBuckets = new Map<number, number>();
        let beigeCount = 0;
        for (const m of members) {
          tierBuckets.set(m.numCities, (tierBuckets.get(m.numCities) ?? 0) + 1);
          if (m.beigeTurns > 0) beigeCount += 1;
        }
        const tierRows = [...tierBuckets.entries()].sort((a,b) => a[0]-b[0]);
        const tierSummary = renderVerticalTierChart(tierRows);
        const topMembers = members
          .sort((a,b) => b.score - a.score)
          .slice(0, 12)
          .map((m) => `• ${m.nationName} (${m.nationId}) — score ${m.score.toFixed(2)}, cities ${m.numCities}, beige ${m.beigeTurns}`)
          .join('\n');

        const embed = new EmbedBuilder()
          .setTitle(`Alliance briefing: ${alliance.name} (${alliance.allianceId})`)
          .setDescription(`Members: **${alliance.numMembers}** | Applicants: **${alliance.numApplicants}** | Beige: **${beigeCount}**`)
          .addFields(
            { name: 'Alliance stats', value: `Score ${alliance.score.toFixed(2)} | Avg score ${alliance.averageScore.toFixed(2)} | Avg cities ${alliance.avgCities.toFixed(2)}` },
            { name: 'City tier distribution', value: tierSummary || 'No tier data' },
            { name: 'Top members', value: topMembers || 'No members found' },
          );
        return void interaction.reply({ embeds: [embed] });
      }


      if (interaction.commandName === 'test_alliance_lots_of_info') {
        const query = interaction.options.getString('query', true).trim();
        const testClient = new PnWClient(PNW_API_KEY, { restUrl: PNW_TEST_REST_URL });
        const alliance = /^\d+$/.test(query)
          ? await testClient.getAllianceById(parseInt(query, 10))
          : await testClient.getAllianceByName(query);
        if (!alliance) return void interaction.reply({ content: 'Alliance not found.', ephemeral: true });
        const members = await testClient.getAllianceMembers([alliance.allianceId]);
        const tierBuckets = new Map<number, number>();
        let beigeCount = 0;
        for (const m of members) {
          tierBuckets.set(m.numCities, (tierBuckets.get(m.numCities) ?? 0) + 1);
          if (m.beigeTurns > 0) beigeCount += 1;
        }
        const tierRows = [...tierBuckets.entries()].sort((a,b) => a[0]-b[0]);
        const tierSummary = renderVerticalTierChart(tierRows);
        const topMembers = members.sort((a,b) => b.score - a.score).slice(0, 12).map((m) => `• ${m.nationName} (${m.nationId}) — score ${m.score.toFixed(2)}, cities ${m.numCities}, beige ${m.beigeTurns}`).join('\n');
        const embed = new EmbedBuilder()
          .setTitle(`Alliance briefing (test): ${alliance.name} (${alliance.allianceId})`)
          .setDescription(`Members: **${alliance.numMembers}** | Applicants: **${alliance.numApplicants}** | Beige: **${beigeCount}**`)
          .addFields(
            { name: 'Alliance stats', value: `Score ${alliance.score.toFixed(2)} | Avg score ${alliance.averageScore.toFixed(2)} | Avg cities ${alliance.avgCities.toFixed(2)}` },
            { name: 'City tier distribution', value: tierSummary || 'No tier data' },
            { name: 'Top members', value: topMembers || 'No members found' },
          );
        return void interaction.reply({ embeds: [embed] });
      }
      if (interaction.commandName === 'fun_quote') {
        const quote = FUN_QUOTES[Math.floor(Math.random() * FUN_QUOTES.length)] ?? 'No quote found.';
        return void interaction.reply({ embeds: [new EmbedBuilder().setTitle('Quote').setDescription(quote)] });
      }

      if (interaction.commandName === 'color') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        const allianceId = await db.getAllianceId(BigInt(interaction.guildId));
        if (!allianceId) return void interaction.reply({ content: 'Primary alliance is not configured.', ephemeral: true });
        const alliance = await pnw.getAllianceById(allianceId);
        if (!alliance) return void interaction.reply({ content: 'Alliance not found.', ephemeral: true });
        const members = await pnw.getAllianceMembers([allianceId]);
        const expected = (alliance.color || '').toLowerCase();
        const wrong = members.filter((m) => !m.beigeTurns && (m.color || '').toLowerCase() !== expected);
        const desc = wrong.length
          ? wrong.slice(0, 30).map((m) => `• ${m.nationName} (${m.nationId}) is **${m.color || 'none'}**`).join('\n')
          : 'All active members are on the correct color.';
        return void interaction.reply({ embeds: [new EmbedBuilder().setTitle(`Alliance color check: ${alliance.name}`).setDescription(desc)] });
      }
      if (interaction.commandName === 'damage_leaderboard') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        const allianceId = await db.getAllianceId(BigInt(interaction.guildId));
        if (!allianceId) return void interaction.reply({ content: 'Primary alliance is not configured.', ephemeral: true });
        const after = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const data = await pnw.getAllianceDamage(allianceId, after);
        const rows = Array.from(data.entries()).map(([nationId, e]) => {
          const infra = Number(e['infra_value'] || 0);
          const loot = Number(e['money_looted'] || 0);
          const res = Number(e['gas_looted'] || 0) + Number(e['mun_looted'] || 0) + Number(e['alum_looted'] || 0) + Number(e['steel_looted'] || 0);
          const total = infra + loot + res;
          return { nationId, name: String(e['nation_name'] || nationId), total };
        }).sort((a,b) => b.total - a.total).slice(0, 20);
        const desc = rows.length
          ? rows.map((r, i) => `${i+1}. **${r.name}** (${r.nationId}) — $${Math.round(r.total).toLocaleString()}`).join('\n')
          : 'No recent damage data.';
        return void interaction.reply({ embeds: [new EmbedBuilder().setTitle('7-day damage leaderboard').setDescription(desc)] });
      }


      if (interaction.commandName === 'welcome_set') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        if (!await hasGovAccess(interaction, db, ['ia','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', ephemeral: true });
        const message = interaction.options.getString('message', true);
        await db.setWelcomeConfig(BigInt(interaction.guildId), { message });
        return void interaction.reply({ content: 'Welcome message updated.' });
      }
      if (interaction.commandName === 'welcome_channel_set') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        if (!await hasGovAccess(interaction, db, ['ia','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', ephemeral: true });
        const ch = interaction.options.getChannel('channel', true);
        await db.setWelcomeConfig(BigInt(interaction.guildId), { channelId: Number(ch.id) });
        return void interaction.reply({ content: `Welcome channel set to <#${ch.id}>.` });
      }
      if (interaction.commandName === 'welcome_enable') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        if (!await hasGovAccess(interaction, db, ['ia','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', ephemeral: true });
        await db.setWelcomeConfig(BigInt(interaction.guildId), { enabled: true });
        return void interaction.reply({ content: 'Welcome messages enabled.' });
      }
      if (interaction.commandName === 'welcome_disable') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        if (!await hasGovAccess(interaction, db, ['ia','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', ephemeral: true });
        await db.setWelcomeConfig(BigInt(interaction.guildId), { enabled: false });
        return void interaction.reply({ content: 'Welcome messages disabled.' });
      }
      if (interaction.commandName === 'welcome_show') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        const cfg = await db.getWelcomeConfig(BigInt(interaction.guildId));
        return void interaction.reply({
          embeds: [new EmbedBuilder().setTitle('Welcome config').setDescription(`Enabled: **${cfg.enabled ? 'yes' : 'no'}**
Channel: ${cfg.channel_id ? `<#${cfg.channel_id}>` : 'not set'}
Message: ${cfg.message}`)],
          ephemeral: true,
        });
      }
      if (interaction.commandName === 'setup_recruiter_add') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        if (!await hasGovAccess(interaction, db, ['ia','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', ephemeral: true });
        const ch = interaction.options.getChannel('channel', true);
        await db.addRecruiterSubscription(BigInt(interaction.guildId), BigInt(ch.id));
        return void interaction.reply({ content: `Recruiter subscription added for <#${ch.id}>.` });
      }
      if (interaction.commandName === 'setup_recruiter_remove') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        if (!await hasGovAccess(interaction, db, ['ia','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', ephemeral: true });
        const ch = interaction.options.getChannel('channel', true);
        const removed = await db.removeRecruiterSubscription(BigInt(interaction.guildId), BigInt(ch.id));
        return void interaction.reply({ content: removed ? `Recruiter subscription removed from <#${ch.id}>.` : `No recruiter subscription found for <#${ch.id}>.` , ephemeral: true});
      }
      if (interaction.commandName === 'setup_recruiter_list') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        const subs = await db.getRecruiterSubscriptions(BigInt(interaction.guildId));
        const text = subs.map((r) => `• <#${r.channel_id}>`).join('\n');
        return void interaction.reply({ content: text || 'No recruiter subscriptions configured.', ephemeral: true });
      }
      if (interaction.commandName === 'admin_api_key_set') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        if (!await hasGovAccess(interaction, db, ['leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', ephemeral: true });
        const apiKey = interaction.options.getString('api_key', true).trim();
        await db.setPnwApiKey(apiKey);
        pnw.apiKey = apiKey;
        return void interaction.reply({ content: 'PnW API key updated and applied at runtime.' , ephemeral: true});
      }



      if (interaction.commandName === 'infra') {
        const from = interaction.options.getNumber('from', true);
        const to = interaction.options.getNumber('to', true);
        const cities = interaction.options.getInteger('cities', true);
        if (to <= from) return void interaction.reply({ content: 'Target infra must be greater than current infra.', ephemeral: true });
        const perCity = calculateInfraCost(from, to);
        const total = perCity * cities;
        return void interaction.reply({ embeds: [new EmbedBuilder().setTitle('Infrastructure cost').setDescription(`From ${from.toFixed(2)} to ${to.toFixed(2)}
Cities: ${cities}
Per city: **$${Math.round(perCity).toLocaleString()}**
Total: **$${Math.round(total).toLocaleString()}**`)] });
      }
      if (interaction.commandName === 'city_cost') {
        const current = interaction.options.getInteger('current', true);
        const target = interaction.options.getInteger('target', true);
        if (target <= current) return void interaction.reply({ content: 'Target city count must be greater than current.', ephemeral: true });
        const gameInfo = await pnw.getGameInfo();
        let total = 0;
        for (let c = current; c < target; c += 1) total += calculateCityCost(c, { cityAverage: gameInfo.cityAverage });
        return void interaction.reply({ embeds: [new EmbedBuilder().setTitle('City purchase cost').setDescription(`From ${current} to ${target}
Estimated total: **$${Math.round(total).toLocaleString()}**
(Using city_average=${gameInfo.cityAverage.toFixed(2)})`)] });
      }
      if (interaction.commandName === 'revenue') {
        const nationId = interaction.options.getInteger('nation_id', true);
        const loaded = await pnw.getNationWithCities(nationId);
        if (!loaded) return void interaction.reply({ content: 'Nation/city data unavailable.', ephemeral: true });
        const [nation, cities] = loaded;
        const gameInfo = await pnw.getGameInfo();
        const rev = computeNationRevenue(nation, cities, gameInfo);
        const desc = [
          `Nation: **${nation.nationName}** (${nation.nationId})`,
          `Money/day: **$${Math.round(rev.money).toLocaleString()}**`,
          `Food/day net: **${rev.food.toFixed(2)}**`,
          `Raws/day: coal ${rev.coal.toFixed(2)}, oil ${rev.oil.toFixed(2)}, uranium ${rev.uranium.toFixed(2)}, iron ${rev.iron.toFixed(2)}, bauxite ${rev.bauxite.toFixed(2)}, lead ${rev.lead.toFixed(2)}`,
          `Manufactured/day: gasoline ${rev.gasoline.toFixed(2)}, munitions ${rev.munitions.toFixed(2)}, steel ${rev.steel.toFixed(2)}, aluminum ${rev.aluminum.toFixed(2)}`,
          `Avg commerce: ${rev.avgCommerce.toFixed(1)}%`,
        ].join('\n');
        return void interaction.reply({ embeds: [new EmbedBuilder().setTitle('Revenue estimate').setDescription(desc)] });
      }
      if (interaction.commandName === 'war_range_targets' || interaction.commandName === 'spy_target_find' || interaction.commandName === 'missile_targets_find') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        const reg = await db.getByDiscordId(BigInt(interaction.user.id));
        if (!reg) return void interaction.reply({ content: 'You are not registered. Use /register first.', ephemeral: true });
        const allianceIds = await db.getSlotsAlliances(BigInt(interaction.guildId));
        if (!allianceIds.length) return void interaction.reply({ content: 'No slot alliances configured. Use /config_slots_set first.', ephemeral: true });

        const me = await pnw.getNation(reg.nation_id);
        if (!me) return void interaction.reply({ content: 'Your registered nation could not be loaded.', ephemeral: true });

        const targets = await pnw.getNationsInAllianceByScoreRange(allianceIds, 0, Number.MAX_SAFE_INTEGER);
        const range = interaction.commandName === 'spy_target_find'
          ? { min: me.score * 0.4, max: me.score * 2.5 }
          : { min: me.score * 0.75, max: me.score * 2.5 };

        const sorted = [...targets].sort((a, b) => b.score - a.score).slice(0, 40);
        const lines = sorted.map((t) => {
          const inRange = t.score >= range.min && t.score <= range.max;
          const marker = inRange ? '🟩' : '⬜';
          if (interaction.commandName === 'spy_target_find') {
            return `${marker} ${t.nationName} (${t.nationId}) — spies ${t.spies}, score ${t.score.toFixed(2)}, cities ${t.numCities}`;
          }
          if (interaction.commandName === 'missile_targets_find') {
            return `${marker} ${t.nationName} (${t.nationId}) — missiles ${t.missiles}, ships ${t.ships}, score ${t.score.toFixed(2)}`;
          }
          return `${marker} ${t.nationName} (${t.nationId}) — score ${t.score.toFixed(2)}, cities ${t.numCities}, def wars ${t.defensiveWars}`;
        });

        const title = interaction.commandName === 'spy_target_find'
          ? `Spy targets for ${me.nationName}`
          : interaction.commandName === 'missile_targets_find'
            ? `Missile targets for ${me.nationName}`
            : `War range targets for ${me.nationName}`;

        const description = [
          `Using registered nation **${me.nationName}** (${me.nationId}) and slotter alliances: ${allianceIds.join(', ')}`,
          `Range: **${range.min.toFixed(2)} - ${range.max.toFixed(2)}**`,
          lines.join('\n') || 'No targets found.',
        ].join('\n\n');

        return void interaction.reply({ embeds: [new EmbedBuilder().setTitle(title).setDescription(description)] });
      }

      if (interaction.commandName === 'admin_sync_commands') {
        if (!await hasGovAccess(interaction, db, ['leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', ephemeral: true });
        const appId = client.application?.id;
        if (!appId) return void interaction.reply({ content: 'Application not ready.', ephemeral: true });
        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
        if (interaction.guildId) {
          await rest.put(Routes.applicationGuildCommands(appId, interaction.guildId), { body: commands });
          return void interaction.reply({ content: 'Guild commands synced.', ephemeral: true });
        }
        await rest.put(Routes.applicationCommands(appId), { body: commands });
        return void interaction.reply({ content: 'Global commands synced.', ephemeral: true });
      }
      if (interaction.commandName === 'admin_clear_guild_commands') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', ephemeral: true });
        if (!await hasGovAccess(interaction, db, ['leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', ephemeral: true });
        const appId = client.application?.id;
        if (!appId) return void interaction.reply({ content: 'Application not ready.', ephemeral: true });
        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
        await rest.put(Routes.applicationGuildCommands(appId, interaction.guildId), { body: [] });
        return void interaction.reply({ content: 'Cleared guild commands for this server.', ephemeral: true });
      }

      if (interaction.commandName === 'help') {
        return void interaction.reply({ embeds: [new EmbedBuilder().setTitle('flame_bot commands').setDescription(renderCommandHelp())], ephemeral: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error';
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: msg, ephemeral: true });
      else await interaction.reply({ content: msg, ephemeral: true });
    }
  });

  let httpServer: Server | null = null;
  if (API_KEY) {
    const app = createApp({
      guildGetter: () => getPrimaryGuild(client),
      apiKey: API_KEY,
      roleConfig: {
        verifiedRoleId: VERIFIED_ROLE_ID != null ? BigInt(VERIFIED_ROLE_ID) : null,
        bar3ClientRoleId: BAR3_CLIENT_ROLE_ID != null ? BigInt(BAR3_CLIENT_ROLE_ID) : null,
        bar3ServerRoleId: BAR3_SERVER_ROLE_ID != null ? BigInt(BAR3_SERVER_ROLE_ID) : null,
      },
      guildsGetter: () => [...client.guilds.cache.values()],
      commandUsageGetter: () => Object.fromEntries(commandUsage.entries()),
      adminIds: ADMIN_DISCORD_IDS,
    });
    httpServer = createServer(app);
    httpServer.listen(API_PORT, () => console.log(`API listening on :${API_PORT}`));
  }

  await client.login(DISCORD_TOKEN);

  const warSubClient = new PnWSubscriptionClient(PNW_API_KEY);
  let warLoopStopped = false;
  const warLoopTask = (async () => {
    for await (const war of warSubClient.iterWarCreates()) {
      if (warLoopStopped) break;
      try {
        const subs = await db.getAllWarAlertSubscriptions();
        for (const sub of subs) {
          const allianceId = await db.getAllianceId(BigInt(sub.guild_id));
          if (!allianceId) continue;
          const involvesAlliance = war.attackerAllianceId === allianceId || war.defenderAllianceId === allianceId;
          if (!involvesAlliance) continue;
          const ownCities = war.attackerAllianceId === allianceId ? war.attackerCities : war.defenderCities;
          if (sub.min_cities != null && ownCities < sub.min_cities) continue;
          if (sub.max_cities != null && ownCities > sub.max_cities) continue;
          const guild = client.guilds.cache.get(sub.guild_id);
          const ch = guild?.channels.cache.get(sub.channel_id) as TextChannel | undefined;
          if (!ch) continue;
          await ch.send({ embeds: [buildWarAlertEmbed(war, allianceId)] });
        }
      } catch (e) {
        console.error('war alert dispatch error', e);
      }
    }
  })();

  const shutdown = async () => {
    if (httpServer) await new Promise<void>((resolve, reject) => httpServer?.close((e) => (e ? reject(e) : resolve())));
    warLoopStopped = true;
    await db.close();
    await Promise.race([warLoopTask, new Promise((r) => setTimeout(r, 1500))]);
    client.destroy();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
}

void main();
