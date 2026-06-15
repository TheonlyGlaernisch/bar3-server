/**
 * Territorial points / leaderboard / multiplier / reward-role / winlog-config
 * commands, ported from the Python bot's commands/economy, commands/multiplier,
 * commands/reward_roles, commands/owner, and commands/admin modules.
 *
 * Cult functionality (commands/cults/*) is intentionally NOT ported.
 *
 * Wire-up in src/index.ts:
 *   - Append TERRITORIAL_COMMANDS to the `commands` array (call .toJSON() like the rest).
 *   - In the interactionCreate handler, add a branch:
 *       const territorialResult = await handleTerritorialCommand(interaction, db);
 *       if (territorialResult) return;
 *     before the "Unhandled slash command" fallback.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import { Database } from './database';
import { checkAndAssignRewards } from './rewards';

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SPECIAL_USER_ID = '780678948949721119';

// ---------------------------------------------------------------------------
// Permission helper (port of utils/permissions.check_bot_manager)
// ---------------------------------------------------------------------------

export async function isBotManager(interaction: ChatInputCommandInteraction, db: Database): Promise<boolean> {
  if (interaction.user.id === SPECIAL_USER_ID) return true;
  if (!interaction.inGuild() || !interaction.guildId) return false;
  const settings = await db.getBotManagerSettings(interaction.guildId);
  if (!settings?.manager_role_id) return false;
  const member = interaction.member;
  if (!member || !('roles' in member) || !member.roles) return false;
  const roleSet = new Set(
    (member.roles as { cache?: Map<string, unknown> }).cache
      ? Array.from((member.roles as { cache: Map<string, unknown> }).cache.keys())
      : (member.roles as unknown as string[]),
  );
  return roleSet.has(settings.manager_role_id);
}

const NEEDS_BOT_MANAGER = '❌ You need Bot Manager role to use this command!';
const GUILD_ONLY = '❌ This command can only be used in servers!';

// ---------------------------------------------------------------------------
// Slash command builders
// ---------------------------------------------------------------------------

export const TERRITORIAL_COMMANDS = [
  new SlashCommandBuilder().setName('bot_manager').setDescription('Configure bot manager role (Admin only)')
    .addRoleOption((o) => o.setName('role').setDescription('Role to set as bot manager').setRequired(true)),

  new SlashCommandBuilder().setName('add').setDescription('Add points to your account')
    .addNumberOption((o) => o.setName('points').setDescription('Points to add (1-1500)').setRequired(true)),

  new SlashCommandBuilder().setName('remove').setDescription('Remove points from your account')
    .addNumberOption((o) => o.setName('points').setDescription('Points to remove (1-1500)').setRequired(true)),

  new SlashCommandBuilder().setName('addscore').setDescription('Add points to a user (Bot Manager required)')
    .addUserOption((o) => o.setName('user').setDescription('User to add points to').setRequired(true))
    .addNumberOption((o) => o.setName('points').setDescription('Points to add').setRequired(true)),

  new SlashCommandBuilder().setName('removescore').setDescription('Remove points from a user (Bot Manager required)')
    .addUserOption((o) => o.setName('user').setDescription('User to remove points from').setRequired(true))
    .addNumberOption((o) => o.setName('points').setDescription('Points to remove').setRequired(true)),

  new SlashCommandBuilder().setName('addwin').setDescription('Add wins to a user (Bot Manager required)')
    .addUserOption((o) => o.setName('user').setDescription('User to add wins to').setRequired(true))
    .addIntegerOption((o) => o.setName('wins').setDescription('Wins to add').setRequired(true)),

  new SlashCommandBuilder().setName('removewin').setDescription('Remove wins from a user (Bot Manager required)')
    .addUserOption((o) => o.setName('user').setDescription('User to remove wins from').setRequired(true))
    .addIntegerOption((o) => o.setName('wins').setDescription('Wins to remove').setRequired(true)),

  new SlashCommandBuilder().setName('adminpoints').setDescription('Add points from a leaderboard message (Admin only)')
    .addStringOption((o) => o.setName('message_id').setDescription('Message ID of the leaderboard').setRequired(true)),

  new SlashCommandBuilder().setName('adminwins').setDescription('Add wins from a leaderboard message (Admin only)')
    .addStringOption((o) => o.setName('message_id').setDescription('Message ID of the leaderboard').setRequired(true)),

  new SlashCommandBuilder().setName('leaderboard').setDescription('Show server leaderboard')
    .addIntegerOption((o) => o.setName('days').setDescription('Days to look back (0=today, 1=yesterday+today, etc. Leave empty for all time)')),

  new SlashCommandBuilder().setName('leaderboard_week').setDescription('Show server leaderboard for last 7 days'),

  new SlashCommandBuilder().setName('profile').setDescription('Show user profile')
    .addUserOption((o) => o.setName('user').setDescription('User to show profile for (optional)')),

  new SlashCommandBuilder().setName('set_multiplier').setDescription('Set server multiplier (Bot Manager required)')
    .addNumberOption((o) => o.setName('multiplier').setDescription('Multiplier value (1-20)').setRequired(true))
    .addStringOption((o) => o.setName('description').setDescription('Description for this multiplier event').setRequired(true)),

  new SlashCommandBuilder().setName('edit_multiplier').setDescription('Edit server multiplier (Bot Manager required)')
    .addNumberOption((o) => o.setName('multiplier').setDescription('New multiplier value (1-20)').setRequired(true))
    .addStringOption((o) => o.setName('description').setDescription('New description for this multiplier event').setRequired(true)),

  new SlashCommandBuilder().setName('end_multiplier').setDescription('End server multiplier (Bot Manager required)'),

  new SlashCommandBuilder().setName('multiplier_info').setDescription('Show current multiplier information'),

  new SlashCommandBuilder().setName('rewardrole').setDescription('Set milestone reward role (Bot Manager required)')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel for notifications').setRequired(true))
    .addStringOption((o) => o.setName('reward_type').setDescription('Points or wins').setRequired(true)
      .addChoices({ name: 'Points', value: 'points' }, { name: 'Wins', value: 'wins' }))
    .addIntegerOption((o) => o.setName('amount').setDescription('Amount needed').setRequired(true))
    .addRoleOption((o) => o.setName('role').setDescription('Role to give').setRequired(true)),

  new SlashCommandBuilder().setName('deletereward').setDescription('Delete a reward role (Bot Manager required)')
    .addStringOption((o) => o.setName('role_id').setDescription('Role ID to remove from rewards').setRequired(true)),

  new SlashCommandBuilder().setName('editrewardrole').setDescription('Edit a reward role (Bot Manager required)')
    .addRoleOption((o) => o.setName('role').setDescription('Role to edit').setRequired(true))
    .addIntegerOption((o) => o.setName('new_amount').setDescription('New amount required').setRequired(true))
    .addChannelOption((o) => o.setName('new_channel').setDescription('New notification channel (optional)')),

  new SlashCommandBuilder().setName('listrewards').setDescription('List reward settings (Bot Manager required)'),

  new SlashCommandBuilder().setName('rolelist').setDescription('Show all reward roles and requirements'),

  new SlashCommandBuilder().setName('force_refresh_rewards').setDescription('Force refresh reward roles for eligible users (Admin only)'),

  new SlashCommandBuilder().setName('cleanup_roles').setDescription('Remove duplicate milestone roles, keep only highest (Admin only)'),

  new SlashCommandBuilder().setName('account_linking').setDescription('Link territorial.io account to Discord user (Admin only)')
    .addStringOption((o) => o.setName('account_name').setDescription('Territorial.io account name (5 characters)').setRequired(true))
    .addUserOption((o) => o.setName('user').setDescription('Discord user to link').setRequired(true)),

  new SlashCommandBuilder().setName('set_winlog').setDescription('Set win log channel (Server owner only)')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to send win logs').setRequired(true))
    .addStringOption((o) => o.setName('clan_name').setDescription('Clan name to filter (required, case insensitive)').setRequired(true)),
];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function getActiveMultiplierValue(db: Database, guildId: string): Promise<number> {
  const doc = await db.getActiveMultiplier(guildId);
  return doc?.multiplier ?? 1.0;
}

function buildRankingDescription(rows: Array<{ userId: string; total: number }>, startRank: number): string {
  if (!rows.length) return '';
  return rows.map((r, i) => `${startRank + i}. <@${r.userId}> - ${r.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}\n`).join('');
}

// ---------------------------------------------------------------------------
// /bot_manager
// ---------------------------------------------------------------------------

async function handleBotManager(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const member = interaction.member as GuildMember;
  if (!member.permissions.has('Administrator')) {
    await interaction.reply({ content: '❌ Administrator permission required!', flags: MessageFlags.Ephemeral });
    return;
  }
  const role = interaction.options.getRole('role', true);
  await db.setBotManagerRole(interaction.guildId, role.id, role.name, interaction.user.id);
  const embed = new EmbedBuilder()
    .setTitle('✅ Bot Manager Role Set')
    .setDescription(`Bot manager role set to <@&${role.id}>`)
    .setColor(0x00ff00);
  await interaction.reply({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// /add, /remove, /addscore, /removescore, /addwin, /removewin
// ---------------------------------------------------------------------------

async function handleAdd(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const points = interaction.options.getNumber('points', true);
  if (points < 1 || points > 1500) {
    await interaction.reply({ content: '❌ Points must be between 1 and 1500!', flags: MessageFlags.Ephemeral });
    return;
  }
  const multiplier = await getActiveMultiplierValue(db, interaction.guildId);
  const finalPoints = points * multiplier;
  const now = new Date();
  const guildId = interaction.guildId;
  const guildName = interaction.guild.name;

  await db.addPoints({
    user_id: interaction.user.id, user_name: interaction.user.tag, guild_id: guildId, guild_name: guildName,
    amount: finalPoints, base_amount: points, multiplier_used: multiplier, type: 'add', timestamp: now,
  });
  await db.addWins({
    user_id: interaction.user.id, user_name: interaction.user.tag, guild_id: guildId, guild_name: guildName,
    amount: 1, type: 'add', timestamp: now,
  });
  if (interaction.guild) {
    await checkAndAssignRewards(interaction.guild, db, interaction.user.id);
  }


  const userPoints = await db.getUserTotal('points', guildId, interaction.user.id);
  const userWins = await db.getUserTotal('wins', guildId, interaction.user.id);

  const embed = new EmbedBuilder().setColor(0x00ff00);
  embed.setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined });
  let desc =
    `${finalPoints.toLocaleString(undefined, { maximumFractionDigits: 1 })} points added to your balance\n` +
    `**New Points:** ${userPoints.toLocaleString(undefined, { maximumFractionDigits: 1 })}\n` +
    `**New Wins:** ${userWins.toLocaleString()}`;
  if (multiplier > 1) {
    desc += `\n**Multiplier:** ${multiplier}x`;
    desc += `\n*(${points.toLocaleString(undefined, { maximumFractionDigits: 1 })} x ${multiplier} = ${finalPoints.toLocaleString(undefined, { maximumFractionDigits: 1 })})*`;
  }
  embed.setDescription(desc);
  await interaction.reply({ embeds: [embed] });
}

async function handleRemove(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const points = interaction.options.getNumber('points', true);
  if (points < 1 || points > 1500) {
    await interaction.reply({ content: '❌ Points must be between 1 and 1500!', flags: MessageFlags.Ephemeral });
    return;
  }
  const multiplier = await getActiveMultiplierValue(db, interaction.guildId);
  const finalPoints = points * multiplier;
  const now = new Date();
  const guildId = interaction.guildId;
  const guildName = interaction.guild.name;

  await db.addPoints({
    user_id: interaction.user.id, user_name: interaction.user.tag, guild_id: guildId, guild_name: guildName,
    amount: -finalPoints, base_amount: -points, multiplier_used: multiplier, type: 'remove', timestamp: now,
  });
  await db.addWins({
    user_id: interaction.user.id, user_name: interaction.user.tag, guild_id: guildId, guild_name: guildName,
    amount: -1, type: 'remove', timestamp: now,
  });

  const userPoints = await db.getUserTotal('points', guildId, interaction.user.id);
  const userWins = await db.getUserTotal('wins', guildId, interaction.user.id);

  const embed = new EmbedBuilder().setColor(0xff0000);
  embed.setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined });
  let desc =
    `${finalPoints.toLocaleString(undefined, { maximumFractionDigits: 1 })} points removed from your balance\n` +
    `**New Points:** ${userPoints.toLocaleString(undefined, { maximumFractionDigits: 1 })}\n` +
    `**New Wins:** ${userWins.toLocaleString()}`;
  if (multiplier > 1) {
    desc += `\n**Multiplier:** ${multiplier}x`;
    desc += `\n*(${points.toLocaleString(undefined, { maximumFractionDigits: 1 })} x ${multiplier} = ${finalPoints.toLocaleString(undefined, { maximumFractionDigits: 1 })})*`;
  }
  embed.setDescription(desc);
  await interaction.reply({ embeds: [embed] });
}

async function handleAddScore(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!(await isBotManager(interaction, db))) {
    await interaction.reply({ content: NEEDS_BOT_MANAGER, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const user = interaction.options.getUser('user', true);
  const points = interaction.options.getNumber('points', true);
  await db.addPoints({
    user_id: user.id, user_name: user.tag, guild_id: interaction.guildId, guild_name: interaction.guild.name,
    amount: points, base_amount: points, multiplier_used: 1.0, type: 'admin_add', added_by: interaction.user.id,
    timestamp: new Date(),
  });
  await checkAndAssignRewards(interaction.guild, db, user.id);
  const embed = new EmbedBuilder()
    .setTitle('✅ Points Added')
    .setDescription(`Added ${points.toLocaleString(undefined, { maximumFractionDigits: 1 })} points to ${user.toString()}`)
    .setColor(0x00ff00)
    .addFields({ name: 'Added by', value: interaction.user.toString(), inline: true });
  await interaction.reply({ embeds: [embed] });
}

async function handleRemoveScore(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!(await isBotManager(interaction, db))) {
    await interaction.reply({ content: NEEDS_BOT_MANAGER, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const user = interaction.options.getUser('user', true);
  const points = interaction.options.getNumber('points', true);
  await db.addPoints({
    user_id: user.id, user_name: user.tag, guild_id: interaction.guildId, guild_name: interaction.guild.name,
    amount: -points, base_amount: -points, multiplier_used: 1.0, type: 'admin_remove', removed_by: interaction.user.id,
    timestamp: new Date(),
  });
  const embed = new EmbedBuilder()
    .setTitle('❌ Points Removed')
    .setDescription(`Removed ${points.toLocaleString(undefined, { maximumFractionDigits: 1 })} points from ${user.toString()}`)
    .setColor(0xff0000)
    .addFields({ name: 'Removed by', value: interaction.user.toString(), inline: true });
  await interaction.reply({ embeds: [embed] });
}

async function handleAddWin(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!(await isBotManager(interaction, db))) {
    await interaction.reply({ content: NEEDS_BOT_MANAGER, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const user = interaction.options.getUser('user', true);
  const wins = interaction.options.getInteger('wins', true);
  await db.addWins({
    user_id: user.id, user_name: user.tag, guild_id: interaction.guildId, guild_name: interaction.guild.name,
    amount: wins, type: 'admin_add', added_by: interaction.user.id, timestamp: new Date(),
  });
  await checkAndAssignRewards(interaction.guild, db, user.id);
  const embed = new EmbedBuilder()
    .setTitle('✅ Wins Added')
    .setDescription(`Added ${wins.toLocaleString()} wins to ${user.toString()}`)
    .setColor(0x00ff00)
    .addFields({ name: 'Added by', value: interaction.user.toString(), inline: true });
  await interaction.reply({ embeds: [embed] });
}

async function handleRemoveWin(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!(await isBotManager(interaction, db))) {
    await interaction.reply({ content: NEEDS_BOT_MANAGER, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const user = interaction.options.getUser('user', true);
  const wins = interaction.options.getInteger('wins', true);
  await db.addWins({
    user_id: user.id, user_name: user.tag, guild_id: interaction.guildId, guild_name: interaction.guild.name,
    amount: -wins, type: 'admin_remove', removed_by: interaction.user.id, timestamp: new Date(),
  });
  const embed = new EmbedBuilder()
    .setTitle('❌ Wins Removed')
    .setDescription(`Removed ${wins.toLocaleString()} wins from ${user.toString()}`)
    .setColor(0xff0000)
    .addFields({ name: 'Removed by', value: interaction.user.toString(), inline: true });
  await interaction.reply({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// /adminpoints, /adminwins
// ---------------------------------------------------------------------------

/**
 * Matches lines like "1. <@123456789012345678> • 1,234" (mentions only —
 * the Python version also tried a username/display-name match against
 * "@username • points", but discord.js doesn't give us a cheap guild-wide
 * username index the way discord.py's member cache does, so only the
 * mention pattern is ported here).
 */
const ADMIN_LEDGER_LINE_RE = /<@!?(\d+)>\s*•\s*([\d.,]+)/;

interface ParsedLedgerEntry {
  userId: string;
  amount: number;
}

function parseLedgerLines(content: string): { entries: ParsedLedgerEntry[]; failed: number } {
  const entries: ParsedLedgerEntry[] = [];
  let failed = 0;
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('Leaderboard') || line.startsWith('Showing') || line === '⠀') continue;
    if (!line.includes('•')) continue;

    const match = ADMIN_LEDGER_LINE_RE.exec(line);
    if (!match) {
      failed += 1;
      continue;
    }
    const userId = match[1]!;
    // adminpoints allows decimals and strips both thousands separators and
    // decimal points (matching the Python bot's int-like parsing); adminwins
    // does the same but the caller treats the result as an integer.
    const amountStr = match[2]!.replace(/,/g, '').replace(/\./g, '');
    const amount = Number(amountStr);
    if (!Number.isFinite(amount)) {
      failed += 1;
      continue;
    }
    entries.push({ userId, amount });
  }
  return { entries, failed };
}

async function findMessageInGuild(interaction: ChatInputCommandInteraction, messageId: string) {
  const guild = interaction.guild!;
  for (const channel of guild.channels.cache.values()) {
    if (!('messages' in channel) || typeof (channel as { messages?: { fetch?: unknown } }).messages?.fetch !== 'function') continue;
    try {
      const message = await (channel as unknown as { messages: { fetch: (id: string) => Promise<import('discord.js').Message> } }).messages.fetch(messageId);
      if (message) return message;
    } catch {
      continue;
    }
  }
  return null;
}

function extractLedgerContent(message: import('discord.js').Message): string | null {
  if (message.embeds.length && message.embeds[0]?.description) return message.embeds[0].description;
  if (message.content) return message.content;
  return null;
}

async function handleAdminPoints(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  const member = interaction.member as GuildMember | null;
  if (!member?.permissions.has('Administrator')) {
    await interaction.reply({ content: "❌ You don't have permission to use this command!", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const messageId = interaction.options.getString('message_id', true).trim();
  if (!/^\d+$/.test(messageId)) {
    await interaction.followUp({ content: '❌ Invalid message ID format!', flags: MessageFlags.Ephemeral });
    return;
  }

  const message = await findMessageInGuild(interaction, messageId);
  if (!message) {
    await interaction.followUp({ content: '❌ Message not found in any channel!', flags: MessageFlags.Ephemeral });
    return;
  }

  const content = extractLedgerContent(message);
  if (!content) {
    await interaction.followUp({ content: '❌ Message has no content to process!', flags: MessageFlags.Ephemeral });
    return;
  }

  const { entries, failed: parseFailed } = parseLedgerLines(content);
  const guildId = interaction.guildId;
  const guildName = interaction.guild.name;
  const multiplier = await getActiveMultiplierValue(db, guildId);

  let processed = 0;
  let failed = parseFailed;
  const successDetails: string[] = [];

  for (const entry of entries) {
    let target = interaction.guild.members.cache.get(entry.userId);
    if (!target) {
      try {
        target = await interaction.guild.members.fetch(entry.userId);
      } catch {
        failed += 1;
        continue;
      }
    }
    const finalPoints = entry.amount * multiplier;
    await db.addPoints({
      user_id: target.id,
      user_name: target.user.tag,
      guild_id: guildId,
      guild_name: guildName,
      amount: finalPoints,
      base_amount: entry.amount,
      multiplier_used: multiplier,
      type: 'adminpoints',
      timestamp: new Date(),
    });
    processed += 1;
    successDetails.push(`${target.displayName}: ${finalPoints.toLocaleString(undefined, { maximumFractionDigits: 0 })} points`);
    await checkAndAssignRewards(interaction.guild, db, target.id);
  }

  if (processed > 0) {
    const embed = new EmbedBuilder()
      .setTitle('✅ Admin Points Added')
      .setDescription(`Successfully processed **${processed}** users\nFailed: **${failed}** entries`)
      .setColor(0x00ff00);
    if (successDetails.length) {
      let detailsText = successDetails.slice(0, 10).join('\n');
      if (successDetails.length > 10) detailsText += `\n...and ${successDetails.length - 10} more`;
      embed.addFields({ name: 'Details', value: detailsText, inline: false });
    }
    embed.addFields(
      { name: 'Processed by', value: interaction.user.toString(), inline: true },
      { name: 'Server', value: guildName, inline: true },
    );
    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else {
    const embed = new EmbedBuilder()
      .setTitle('❌ No Points Added')
      .setDescription(`Failed to process any users from the message\nFailed entries: ${failed}`)
      .setColor(0xff0000);
    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

async function handleAdminWins(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  const member = interaction.member as GuildMember | null;
  if (!member?.permissions.has('Administrator')) {
    await interaction.reply({ content: "❌ You don't have permission to use this command!", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const messageId = interaction.options.getString('message_id', true).trim();
  if (!/^\d+$/.test(messageId)) {
    await interaction.followUp({ content: '❌ Invalid message ID format!', flags: MessageFlags.Ephemeral });
    return;
  }

  const message = await findMessageInGuild(interaction, messageId);
  if (!message) {
    await interaction.followUp({ content: '❌ Message not found in any channel!', flags: MessageFlags.Ephemeral });
    return;
  }

  const content = extractLedgerContent(message);
  if (!content) {
    await interaction.followUp({ content: '❌ Message has no content to process!', flags: MessageFlags.Ephemeral });
    return;
  }

  const { entries, failed: parseFailed } = parseLedgerLines(content);
  const guildId = interaction.guildId;
  const guildName = interaction.guild.name;

  let processed = 0;
  let failed = parseFailed;
  const successDetails: string[] = [];

  for (const entry of entries) {
    let target = interaction.guild.members.cache.get(entry.userId);
    if (!target) {
      try {
        target = await interaction.guild.members.fetch(entry.userId);
      } catch {
        failed += 1;
        continue;
      }
    }
    const wins = Math.trunc(entry.amount);
    await db.addWins({
      user_id: target.id,
      user_name: target.user.tag,
      guild_id: guildId,
      guild_name: guildName,
      amount: wins,
      type: 'adminwins',
      timestamp: new Date(),
    });
    processed += 1;
    successDetails.push(`${target.displayName}: ${wins.toLocaleString()} wins`);
    await checkAndAssignRewards(interaction.guild, db, target.id);
  }

  if (processed > 0) {
    const embed = new EmbedBuilder()
      .setTitle('✅ Admin Wins Added')
      .setDescription(`Successfully processed **${processed}** users\nFailed: **${failed}** entries`)
      .setColor(0x00ff00);
    if (successDetails.length) {
      let detailsText = successDetails.slice(0, 10).join('\n');
      if (successDetails.length > 10) detailsText += `\n...and ${successDetails.length - 10} more`;
      embed.addFields({ name: 'Details', value: detailsText, inline: false });
    }
    embed.addFields(
      { name: 'Processed by', value: interaction.user.toString(), inline: true },
      { name: 'Server', value: guildName, inline: true },
    );
    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else {
    const embed = new EmbedBuilder()
      .setTitle('❌ No Wins Added')
      .setDescription(`Failed to process any users from the message\nFailed entries: ${failed}`)
      .setColor(0xff0000);
    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// ---------------------------------------------------------------------------
// /leaderboard, /leaderboard_week
// ---------------------------------------------------------------------------

const LB_PAGE_SIZE = 10;

interface LbState {
  page: number;
  mode: 'points' | 'wins';
  days: number | null; // explicit "days" filter (mutually exclusive with month)
  month: [number, number] | null; // [year, month]
}

function lbDateRange(state: LbState): { since?: Date; until?: Date } {
  if (state.days != null) {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (state.days === 0) {
      return { since: todayStart, until: new Date(todayStart.getTime() + 86400000) };
    }
    return { since: new Date(todayStart.getTime() - state.days * 86400000) };
  }
  if (state.month) {
    const [year, month] = state.month;
    const since = new Date(Date.UTC(year, month - 1, 1));
    const until = month === 12 ? new Date(Date.UTC(year + 1, 0, 1)) : new Date(Date.UTC(year, month, 1));
    return { since, until };
  }
  return {};
}

function lbTitle(state: LbState, guildName: string): string {
  const modeLabel = state.mode === 'points' ? 'Points' : 'Wins';
  if (state.days != null) {
    return state.days === 0
      ? `${modeLabel} Leaderboard - Today (GMT) - ${guildName}`
      : `${modeLabel} Leaderboard - Last ${state.days + 1} days (GMT) - ${guildName}`;
  }
  if (state.month) {
    const [year, month] = state.month;
    return `${modeLabel} Leaderboard - ${MONTH_NAMES[month]} ${year} - ${guildName}`;
  }
  return `${modeLabel} Leaderboard - All Time - ${guildName}`;
}

function lbFooter(state: LbState): string {
  if (state.days != null) return state.days === 0 ? 'Today (GMT)' : `Last ${state.days + 1} days (GMT)`;
  return 'All-time';
}

async function buildLbEmbed(db: Database, guildId: string, guildName: string, state: LbState): Promise<EmbedBuilder> {
  const { since, until } = lbDateRange(state);
  const rows = await db.getGuildRanking(state.mode, guildId, { since, until, page: state.page, pageSize: LB_PAGE_SIZE });
  const title = lbTitle(state, guildName);
  if (!rows.length) {
    return new EmbedBuilder().setTitle(title).setDescription('No data found for this period.').setColor(0x2b2d31);
  }
  const embed = new EmbedBuilder().setTitle(title).setColor(0x00ff00);
  embed.setDescription(buildRankingDescription(rows, state.page * LB_PAGE_SIZE + 1));
  embed.setFooter({ text: lbFooter(state) });
  return embed;
}

function buildLbComponents(
  state: LbState,
  availableMonths: Array<[number, number]>,
): Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> {
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('lb_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(state.page === 0),
    new ButtonBuilder().setCustomId('lb_toggle_mode').setLabel(state.mode === 'wins' ? 'Points' : 'Wins').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('lb_next').setLabel('▶').setStyle(ButtonStyle.Secondary),
  );

  const select = new StringSelectMenuBuilder().setCustomId('lb_month').setPlaceholder('Select month...');
  select.addOptions({ label: 'All Time', value: 'all', default: state.month === null && state.days == null });
  for (const [year, month] of availableMonths.slice(0, 24)) {
    select.addOptions({
      label: `${MONTH_NAMES[month]} ${year}`,
      value: `${year}-${month}`,
      default: state.month?.[0] === year && state.month?.[1] === month,
    });
  }
  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  return [buttonRow, selectRow];
}

async function handleLeaderboard(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  const days = interaction.options.getInteger('days');
  const guildId = interaction.guildId;
  const guildName = interaction.guild.name;

  const state: LbState = { page: 0, mode: 'points', days, month: null };
  const availableMonths = await db.getAvailableMonths(guildId);

  const embed = await buildLbEmbed(db, guildId, guildName, state);
  const components = buildLbComponents(state, availableMonths);
  const msg = await interaction.editReply({ embeds: [embed], components });

  const collector = msg.createMessageComponentCollector({ time: 300_000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({ content: 'Only the command caller can use these controls.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (i.isButton()) {
      if (i.customId === 'lb_prev' && state.page > 0) state.page -= 1;
      else if (i.customId === 'lb_next') state.page += 1;
      else if (i.customId === 'lb_toggle_mode') {
        state.mode = state.mode === 'points' ? 'wins' : 'points';
        state.page = 0;
      }
    } else if (i.isStringSelectMenu()) {
      const sel = (i as StringSelectMenuInteraction).values[0];
      if (sel === 'all') {
        state.month = null;
        state.days = null;
      } else if (sel) {
        const [year, month] = sel.split('-').map(Number);
        state.month = [year!, month!];
        state.days = null;
      }
      state.page = 0;
    }
    const newEmbed = await buildLbEmbed(db, guildId, guildName, state);
    const newComponents = buildLbComponents(state, availableMonths);
    await i.update({ embeds: [newEmbed], components: newComponents });
  });
}

async function handleLeaderboardWeek(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  const guildId = interaction.guildId;
  const guildName = interaction.guild.name;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  let mode: 'points' | 'wins' = 'points';
  let page = 0;

  const build = async () => {
    const rows = await db.getGuildRanking(mode, guildId, { since, page, pageSize: 10 });
    const title = `${mode === 'points' ? 'Points' : 'Wins'} Leaderboard - Last 7 Days - ${guildName}`;
    const embed = rows.length
      ? new EmbedBuilder().setTitle(title).setDescription(buildRankingDescription(rows, page * 10 + 1)).setColor(0x00ff00)
      : new EmbedBuilder().setTitle(title).setDescription('No data found for the last 7 days.').setColor(0x2b2d31);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('lbw_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId('lbw_toggle').setLabel(mode === 'wins' ? 'Points' : 'Wins').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('lbw_next').setLabel('▶').setStyle(ButtonStyle.Secondary),
    );
    return { embed, row };
  };

  const { embed, row } = await build();
  const msg = await interaction.editReply({ embeds: [embed], components: [row] });

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300_000 });
  collector.on('collect', async (btn) => {
    if (btn.user.id !== interaction.user.id) {
      await btn.reply({ content: 'Only the command caller can use these buttons.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (btn.customId === 'lbw_prev' && page > 0) page -= 1;
    else if (btn.customId === 'lbw_next') page += 1;
    else if (btn.customId === 'lbw_toggle') { mode = mode === 'points' ? 'wins' : 'points'; page = 0; }
    const { embed: newEmbed, row: newRow } = await build();
    await btn.update({ embeds: [newEmbed], components: [newRow] });
  });
}

// ---------------------------------------------------------------------------
// /profile
// ---------------------------------------------------------------------------

async function handleProfile(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const target = interaction.options.getUser('user') ?? interaction.user;
  const guildId = interaction.guildId;

  const totalPoints = await db.getUserTotal('points', guildId, target.id);
  const totalWins = await db.getUserTotal('wins', guildId, target.id);
  const pointsRank = await db.getUserRank('points', guildId, target.id);
  const winsRank = await db.getUserRank('wins', guildId, target.id);

  const rewardRoles = await db.getRewardRoles(guildId);
  const nextReward = rewardRoles
    .filter((r) => r.type === 'points' && r.amount > totalPoints)
    .sort((a, b) => a.amount - b.amount)[0];

  let progressText = '';
  if (nextReward) {
    const progress = totalPoints / nextReward.amount;
    const filled = Math.min(10, Math.max(0, Math.floor(progress * 10)));
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    const role = interaction.guild.roles.cache.get(nextReward.role_id);
    const roleName = role?.name ?? 'Unknown Role';
    progressText = `\n\n**Next Reward:** ${roleName}\n${bar} ${totalPoints.toLocaleString(undefined, { maximumFractionDigits: 0 })}/${nextReward.amount.toLocaleString()} (${(progress * 100).toFixed(1)}%)`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${target.username}'s Profile`)
    .setColor(0x00ff00)
    .setThumbnail(target.displayAvatarURL());

  embed.addFields({
    name: '📊 Stats',
    value: `**Points:** ${totalPoints.toLocaleString(undefined, { maximumFractionDigits: 0 })} (#${pointsRank ?? 'N/A'})\n**Wins:** ${totalWins.toLocaleString(undefined, { maximumFractionDigits: 0 })} (#${winsRank ?? 'N/A'})${progressText}`,
    inline: true,
  });
  embed.setFooter({ text: `Server: ${interaction.guild.name}` });

  await interaction.reply({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// Multiplier commands
// ---------------------------------------------------------------------------

async function handleSetMultiplier(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!(await isBotManager(interaction, db))) {
    await interaction.reply({ content: NEEDS_BOT_MANAGER, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const multiplier = interaction.options.getNumber('multiplier', true);
  const description = interaction.options.getString('description', true);
  if (multiplier < 1 || multiplier > 20) {
    await interaction.reply({ content: '❌ Multiplier must be between 1 and 20!', flags: MessageFlags.Ephemeral });
    return;
  }
  if (description.length > 100) {
    await interaction.reply({ content: '❌ Description must be 100 characters or less!', flags: MessageFlags.Ephemeral });
    return;
  }
  await db.setMultiplier({
    guild_id: interaction.guildId,
    guild_name: interaction.guild.name,
    multiplier,
    description,
    set_by: interaction.user.id,
    set_by_name: interaction.user.tag,
    timestamp: new Date(),
  });
  const embed = new EmbedBuilder()
    .setTitle('✅ Multiplier Set')
    .setDescription(`Server multiplier set to **${multiplier}x**`)
    .setColor(0x00ff00)
    .addFields(
      { name: 'Description', value: description, inline: false },
      { name: 'Set by', value: interaction.user.toString(), inline: true },
      { name: 'Server', value: interaction.guild.name, inline: true },
    )
    .setFooter({ text: 'Points will now be multiplied by this value' });
  await interaction.reply({ embeds: [embed] });
}

async function handleEditMultiplier(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!(await isBotManager(interaction, db))) {
    await interaction.reply({ content: NEEDS_BOT_MANAGER, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const multiplier = interaction.options.getNumber('multiplier', true);
  const description = interaction.options.getString('description', true);
  if (multiplier < 1 || multiplier > 20) {
    await interaction.reply({ content: '❌ Multiplier must be between 1 and 20!', flags: MessageFlags.Ephemeral });
    return;
  }
  if (description.length > 100) {
    await interaction.reply({ content: '❌ Description must be 100 characters or less!', flags: MessageFlags.Ephemeral });
    return;
  }
  const existing = await db.editMultiplier(interaction.guildId, multiplier, description, interaction.user.id, interaction.user.tag);
  if (!existing) {
    await interaction.reply({ content: '❌ No active multiplier found! Use `/set_multiplier` first.', flags: MessageFlags.Ephemeral });
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle('✏️ Multiplier Updated')
    .setColor(0xffa500)
    .addFields(
      { name: 'Old Multiplier', value: `${existing.multiplier}x`, inline: true },
      { name: 'New Multiplier', value: `${multiplier}x`, inline: true },
      { name: 'Description', value: description, inline: false },
      { name: 'Updated by', value: interaction.user.toString(), inline: false },
    )
    .setFooter({ text: 'Points will now be multiplied by the new value' });
  await interaction.reply({ embeds: [embed] });
}

async function handleEndMultiplier(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!(await isBotManager(interaction, db))) {
    await interaction.reply({ content: NEEDS_BOT_MANAGER, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const existing = await db.endMultiplier(interaction.guildId, interaction.user.id, interaction.user.tag);
  if (!existing) {
    await interaction.reply({ content: '❌ No active multiplier found!', flags: MessageFlags.Ephemeral });
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle('🛑 Multiplier Ended')
    .setDescription(`Server multiplier (${existing.multiplier}x) has been deactivated`)
    .setColor(0xff0000)
    .addFields(
      { name: 'Ended by', value: interaction.user.toString(), inline: true },
      { name: 'Server', value: interaction.guild.name, inline: true },
    )
    .setFooter({ text: 'Points will now be added at normal rate (1x)' });
  await interaction.reply({ embeds: [embed] });
}

async function handleMultiplierInfo(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const data = await db.getActiveMultiplier(interaction.guildId);
  const embed = new EmbedBuilder().setColor(0x00ff00);
  embed.setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined });
  if (!data) {
    embed.setTitle('❌ No Active Multiplier');
    embed.setDescription('No multiplier is currently active in this server.');
    embed.setColor(0x2b2d31);
  } else {
    embed.setTitle(`✅ Active Multiplier: ${data.multiplier}x`);
    embed.setDescription(data.description);
    embed.addFields(
      { name: 'Set by', value: `<@${data.set_by}>`, inline: true },
      { name: 'Started', value: `<t:${Math.floor(data.timestamp.getTime() / 1000)}:R>`, inline: true },
    );
    if (data.edited_by && data.edit_timestamp) {
      embed.addFields({ name: 'Last Edited', value: `<t:${Math.floor(data.edit_timestamp.getTime() / 1000)}:R>`, inline: true });
    }
  }
  await interaction.reply({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// Reward role commands
// ---------------------------------------------------------------------------

async function handleRewardRole(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!(await isBotManager(interaction, db))) {
    await interaction.reply({ content: NEEDS_BOT_MANAGER, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const channel = interaction.options.getChannel('channel', true);
  const rewardType = interaction.options.getString('reward_type', true) as 'points' | 'wins';
  const amount = interaction.options.getInteger('amount', true);
  const role = interaction.options.getRole('role', true);

  if (amount <= 0) {
    await interaction.reply({ content: '❌ Amount must be greater than 0!', flags: MessageFlags.Ephemeral });
    return;
  }
  const me = interaction.guild.members.me;
  if (me && 'position' in role && role.position >= me.roles.highest.position) {
    await interaction.reply({ content: '❌ Role is too high for me to assign!', flags: MessageFlags.Ephemeral });
    return;
  }

  await db.addRewardRole({
    guild_id: interaction.guildId,
    channel_id: channel.id,
    role_id: role.id,
    role_name: role.name,
    type: rewardType,
    amount,
    created_at: new Date(),
    created_by: interaction.user.id,
    active: true,
  });

  const embed = new EmbedBuilder()
    .setTitle('✅ Reward Role Set')
    .setDescription(`Users who reach **${amount.toLocaleString()} ${rewardType}** will get <@&${role.id}>`)
    .setColor(0x00ff00)
    .addFields({ name: 'Notifications', value: `<#${channel.id}>`, inline: true });
  await interaction.reply({ embeds: [embed] });
}

async function handleDeleteReward(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!(await isBotManager(interaction, db))) {
    await interaction.reply({ content: NEEDS_BOT_MANAGER, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const roleId = interaction.options.getString('role_id', true).trim();
  if (!/^\d+$/.test(roleId)) {
    await interaction.reply({ content: '❌ Invalid role!', flags: MessageFlags.Ephemeral });
    return;
  }
  const removed = await db.deleteRewardRole(interaction.guildId, roleId);
  const embed = new EmbedBuilder()
    .setDescription(removed ? `Removed reward for <@&${roleId}>` : `No reward found for <@&${roleId}>`)
    .setColor(removed ? 0x00ff00 : 0xff0000);
  await interaction.reply({ embeds: [embed] });
}

async function handleEditRewardRole(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!(await isBotManager(interaction, db))) {
    await interaction.reply({ content: NEEDS_BOT_MANAGER, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const role = interaction.options.getRole('role', true);
  const newAmount = interaction.options.getInteger('new_amount', true);
  const newChannel = interaction.options.getChannel('new_channel');
  if (newAmount <= 0) {
    await interaction.reply({ content: '❌ Amount must be greater than 0!', flags: MessageFlags.Ephemeral });
    return;
  }
  const modified = await db.editRewardRole(interaction.guildId, role.id, {
    amount: newAmount,
    channelId: newChannel?.id,
  });
  const embed = new EmbedBuilder()
    .setDescription(
      modified
        ? `Updated reward for <@&${role.id}> to ${newAmount.toLocaleString()}` +
          (newChannel ? ` with notifications in <#${newChannel.id}>` : '')
        : `No reward found for <@&${role.id}>`,
    )
    .setColor(modified ? 0x00ff00 : 0xff0000);
  await interaction.reply({ embeds: [embed] });
}

async function handleListRewards(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!(await isBotManager(interaction, db))) {
    await interaction.reply({ content: NEEDS_BOT_MANAGER, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const guild = interaction.guild;
  const rewards = await db.getRewardRoles(interaction.guildId);
  if (!rewards.length) {
    await interaction.reply({ content: '❌ No reward roles set up!', flags: MessageFlags.Ephemeral });
    return;
  }
  const points = rewards.filter((r) => r.type === 'points').sort((a, b) => a.amount - b.amount);
  const wins = rewards.filter((r) => r.type === 'wins').sort((a, b) => a.amount - b.amount);

  const PER_PAGE = 8;
  type PageInfo = { rows: RewardRoleEntry[]; type: 'points' | 'wins'; startNum: number };
  const pages: PageInfo[] = [];
  for (let i = 0; i < points.length; i += PER_PAGE) pages.push({ rows: points.slice(i, i + PER_PAGE), type: 'points', startNum: i + 1 });
  for (let i = 0; i < wins.length; i += PER_PAGE) pages.push({ rows: wins.slice(i, i + PER_PAGE), type: 'wins', startNum: i + 1 });
  if (!pages.length) pages.push({ rows: [], type: 'points', startNum: 1 });

  let page = 0;
  const total = rewards.length;
  const build = () => {
    const p = pages[page]!;
    const embed = new EmbedBuilder()
      .setTitle(p.type === 'points' ? '📊 Points Reward Configuration' : '🏆 Wins Reward Configuration')
      .setColor(p.type === 'points' ? 0x00ff00 : 0xffa500);
    for (let i = 0; i < p.rows.length; i++) {
      const r = p.rows[i]!;
      const value = `Role: <@&${r.role_id}>\nChannel: <#${r.channel_id}>`;
      embed.addFields({ name: `${p.startNum + i}. ${r.amount.toLocaleString()} ${p.type}`, value, inline: true });
    }
    embed.setFooter({ text: pages.length > 1 ? `Page ${page + 1}/${pages.length} • Total: ${total} rewards` : `Total: ${total} rewards` });
    return embed;
  };

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('lr_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('lr_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= pages.length - 1),
  );
  if (pages.length <= 1) {
    await interaction.reply({ embeds: [build()] });
    return;
  }
  const msg = await interaction.reply({ embeds: [build()], components: [row], withResponse: true });
  const message = await msg.resource?.message?.fetch();
  if (!message) return;
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300_000 });
  collector.on('collect', async (btn) => {
    if (btn.user.id !== interaction.user.id) {
      await btn.reply({ content: 'Only the command caller can use these buttons.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (btn.customId === 'lr_prev' && page > 0) page -= 1;
    else if (btn.customId === 'lr_next' && page < pages.length - 1) page += 1;
    row.components[0]!.setDisabled(page === 0);
    row.components[1]!.setDisabled(page >= pages.length - 1);
    await btn.update({ embeds: [build()], components: [row] });
  });
  collector.on('end', async () => {
    try { await interaction.editReply({ components: [] }); } catch { /* */ }
  });
  void guild;
}

async function handleRoleList(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const guild = interaction.guild;
  const rewards = await db.getRewardRoles(interaction.guildId);
  if (!rewards.length) {
    await interaction.reply({ content: 'No reward roles available!', flags: MessageFlags.Ephemeral });
    return;
  }
  const points = rewards.filter((r) => r.type === 'points').sort((a, b) => a.amount - b.amount);
  const wins = rewards.filter((r) => r.type === 'wins').sort((a, b) => a.amount - b.amount);

  const PER_PAGE = 10;
  type PageInfo = { rows: RewardRoleEntry[]; type: 'points' | 'wins' };
  const pages: PageInfo[] = [];
  for (let i = 0; i < points.length; i += PER_PAGE) pages.push({ rows: points.slice(i, i + PER_PAGE), type: 'points' });
  for (let i = 0; i < wins.length; i += PER_PAGE) pages.push({ rows: wins.slice(i, i + PER_PAGE), type: 'wins' });
  if (!pages.length) pages.push({ rows: [], type: 'points' });

  let page = 0;
  const build = () => {
    const p = pages[page]!;
    const embed = new EmbedBuilder()
      .setTitle(p.type === 'points' ? `📊 Points Reward Roles - ${guild.name}` : `🏆 Wins Reward Roles - ${guild.name}`)
      .setColor(p.type === 'points' ? 0x00ff00 : 0xffa500)
      .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined });
    const text = p.rows.map((r) => `<@&${r.role_id}> - ${r.amount.toLocaleString()} ${p.type}\n`).join('');
    embed.setDescription(text || `No ${p.type} rewards found.`);
    if (pages.length > 1) embed.setFooter({ text: `Page ${page + 1}/${pages.length}` });
    return embed;
  };

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('rl_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('rl_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= pages.length - 1),
  );
  if (pages.length <= 1) {
    await interaction.reply({ embeds: [build()] });
    return;
  }
  const msg = await interaction.reply({ embeds: [build()], components: [row], withResponse: true });
  const message = await msg.resource?.message?.fetch();
  if (!message) return;
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300_000 });
  collector.on('collect', async (btn) => {
    if (btn.customId === 'rl_prev' && page > 0) page -= 1;
    else if (btn.customId === 'rl_next' && page < pages.length - 1) page += 1;
    row.components[0]!.setDisabled(page === 0);
    row.components[1]!.setDisabled(page >= pages.length - 1);
    await btn.update({ embeds: [build()], components: [row] });
  });
  collector.on('end', async () => {
    try { await interaction.editReply({ components: [] }); } catch { /* */ }
  });
}

// ---------------------------------------------------------------------------
// /force_refresh_rewards, /cleanup_roles
// ---------------------------------------------------------------------------

type RewardRoleEntry = Awaited<ReturnType<Database['getRewardRoles']>>[number];

async function handleForceRefreshRewards(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  const member = interaction.member as GuildMember | null;
  const isAdmin = interaction.user.id === SPECIAL_USER_ID || (member?.permissions.has('Administrator') ?? false);
  if (!isAdmin) {
    await interaction.reply({ content: '❌ Administrator permission required!', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();

  const guild = interaction.guild;
  const guildId = interaction.guildId;
  const rewards = await db.getRewardRoles(guildId);
  if (!rewards.length) {
    await interaction.followUp('❌ No reward roles configured!');
    return;
  }
  const pointsRewards = rewards.filter((r) => r.type === 'points');
  const winsRewards = rewards.filter((r) => r.type === 'wins');
  let processed = 0;

  for (const [type, typeRewards] of [['points', pointsRewards], ['wins', winsRewards]] as const) {
    if (!typeRewards.length) continue;

    const rows = await db.getGuildRanking(type, guildId, { pageSize: 100000 });
    const totals = new Map<string, number>(rows.map((r) => [r.userId, r.total]));

    for (const [userId, total] of totals) {
      let highest: RewardRoleEntry | null = null;
      for (const reward of typeRewards) {
        if (total >= reward.amount && (!highest || reward.amount > highest.amount)) highest = reward;
      }
      if (!highest) continue;

      let member = guild.members.cache.get(userId);
      if (!member) {
        try { member = await guild.members.fetch(userId); } catch { continue; }
      }
      const role = guild.roles.cache.get(highest.role_id);
      if (!role) continue;
      if (member.roles.cache.has(role.id)) continue;

      try {
        const lowerRoles = typeRewards
          .filter((r) => r.amount < highest!.amount)
          .map((r) => guild.roles.cache.get(r.role_id))
          .filter((r): r is NonNullable<typeof r> => !!r && member!.roles.cache.has(r.id));
        if (lowerRoles.length) await member.roles.remove(lowerRoles, 'Reward refresh');
        await member.roles.add(role, `Reward refresh: ${total.toLocaleString()} ${type}`);
        processed += 1;
      } catch {
        continue;
      }
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ Reward Refresh Complete')
    .setDescription(`Processed ${processed} role assignments`)
    .setColor(0x00ff00);
  await interaction.followUp({ embeds: [embed] });
}

async function handleCleanupRoles(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  const member = interaction.member as GuildMember | null;
  if (!member?.permissions.has('Administrator')) {
    await interaction.reply({ content: '❌ Administrator permission required!', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  const guild = interaction.guild;
  const rewards = (await db.getRewardRoles(interaction.guildId)).sort((a, b) => b.amount - a.amount);
  if (!rewards.length) {
    await interaction.followUp('❌ No reward roles found!');
    return;
  }
  const pointsRewards = rewards.filter((r) => r.type === 'points');
  const winsRewards = rewards.filter((r) => r.type === 'wins');
  let cleaned = 0;

  const allMembers = await guild.members.fetch();
  for (const member of allMembers.values()) {
    if (member.user.bot) continue;
    for (const typeRewards of [pointsRewards, winsRewards]) {
      if (typeRewards.length <= 1) continue;
      const held = typeRewards
        .map((r) => ({ reward: r, role: guild.roles.cache.get(r.role_id) }))
        .filter((x): x is { reward: RewardRoleEntry; role: NonNullable<ReturnType<typeof guild.roles.cache.get>> } =>
          !!x.role && member.roles.cache.has(x.role.id));
      if (held.length > 1) {
        const highest = held.reduce((a, b) => (b.reward.amount > a.reward.amount ? b : a));
        const toRemove = held.filter((h) => h.reward.amount < highest.reward.amount).map((h) => h.role);
        if (toRemove.length) {
          await member.roles.remove(toRemove, 'Cleanup: keep only highest milestone role');
          cleaned += 1;
        }
      }
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ Role Cleanup Complete')
    .setDescription(`Cleaned up milestone roles for ${cleaned} users.\nEach user now has only their highest points role and highest wins role.`)
    .setColor(0x00ff00);
  await interaction.followUp({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// /account_linking
// ---------------------------------------------------------------------------

async function handleAccountLinking(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  const member = interaction.member as GuildMember | null;
  if (!member?.permissions.has('Administrator')) {
    await interaction.reply({ content: "❌ You don't have permission to use this command!", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  const accountName = interaction.options.getString('account_name', true);
  const user = interaction.options.getUser('user', true);
  if (accountName.length !== 5) {
    await interaction.reply({ content: '❌ Account name must be exactly 5 characters!', flags: MessageFlags.Ephemeral });
    return;
  }
  await db.setAccountLink({
    user_id: user.id,
    guild_id: interaction.guildId,
    account_name: accountName,
    linked_by: interaction.user.id,
    timestamp: new Date(),
  });

  try {
    const dmEmbed = new EmbedBuilder()
      .setTitle('🔗 Account Linked')
      .setDescription(
        `Your territorial.io account \`${accountName}\` is now linked!\n\n` +
          `If you are a clan winner, points will be automatically added to your account.`,
      )
      .setColor(0x00ff00);
    await user.send({ embeds: [dmEmbed] });
  } catch {
    /* ignore DM failures */
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ Account Linked')
    .setDescription(`Successfully linked \`${accountName}\` to ${user.toString()}`)
    .setColor(0x00ff00);
  await interaction.reply({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// /set_winlog
// ---------------------------------------------------------------------------

const TRUSTED_SET_WINLOG_USER_ID = '886675726026276896';

async function handleSetWinlog(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.id !== TRUSTED_SET_WINLOG_USER_ID) {
    const owner = await interaction.guild.fetchOwner().catch(() => null);
    if (!owner || interaction.user.id !== owner.id) {
      await interaction.reply({ content: '❌ Only server owner or authorized user can use this command!', flags: MessageFlags.Ephemeral });
      return;
    }
  }
  const channel = interaction.options.getChannel('channel', true);
  const clanName = interaction.options.getString('clan_name', true).trim();

  await db.setWinlogSettings({
    guild_id: interaction.guildId,
    guild_name: interaction.guild.name,
    channel_id: channel.id,
    channel_name: channel.name ?? '',
    clan_name: clanName,
    set_by: interaction.user.id,
    set_by_name: interaction.user.tag,
    timestamp: new Date(),
    active: true,
  });

  const embed = new EmbedBuilder()
    .setTitle('✅ Win Log Channel Set')
    .setDescription(`Win logs will be monitored in <#${channel.id}>`)
    .setColor(0x00ff00)
    .addFields(
      { name: 'Set by', value: interaction.user.toString(), inline: true },
      { name: 'Server', value: interaction.guild.name, inline: true },
      { name: 'Clan Filter', value: `Only **${clanName}** wins`, inline: true },
    );
  await interaction.reply({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const TERRITORIAL_COMMAND_NAMES = new Set([
  'bot_manager', 'add', 'remove', 'addscore', 'removescore', 'addwin', 'removewin',
  'adminpoints', 'adminwins', 'leaderboard', 'leaderboard_week', 'profile',
  'set_multiplier', 'edit_multiplier', 'end_multiplier', 'multiplier_info',
  'rewardrole', 'deletereward', 'editrewardrole', 'listrewards', 'rolelist',
  'force_refresh_rewards', 'cleanup_roles',
  'account_linking', 'set_winlog',
]);

/**
 * Returns true if the command was handled (caller should stop further dispatch).
 */
export async function handleTerritorialCommand(interaction: ChatInputCommandInteraction, db: Database): Promise<boolean> {
  const name = interaction.commandName;
  if (!TERRITORIAL_COMMAND_NAMES.has(name)) return false;

  switch (name) {
    case 'bot_manager': await handleBotManager(interaction, db); break;
    case 'add': await handleAdd(interaction, db); break;
    case 'remove': await handleRemove(interaction, db); break;
    case 'addscore': await handleAddScore(interaction, db); break;
    case 'removescore': await handleRemoveScore(interaction, db); break;
    case 'addwin': await handleAddWin(interaction, db); break;
    case 'removewin': await handleRemoveWin(interaction, db); break;
    case 'adminpoints': await handleAdminPoints(interaction, db); break;
    case 'adminwins': await handleAdminWins(interaction, db); break;
    case 'leaderboard': await handleLeaderboard(interaction, db); break;
    case 'leaderboard_week': await handleLeaderboardWeek(interaction, db); break;
    case 'profile': await handleProfile(interaction, db); break;
    case 'set_multiplier': await handleSetMultiplier(interaction, db); break;
    case 'edit_multiplier': await handleEditMultiplier(interaction, db); break;
    case 'end_multiplier': await handleEndMultiplier(interaction, db); break;
    case 'multiplier_info': await handleMultiplierInfo(interaction, db); break;
    case 'rewardrole': await handleRewardRole(interaction, db); break;
    case 'deletereward': await handleDeleteReward(interaction, db); break;
    case 'editrewardrole': await handleEditRewardRole(interaction, db); break;
    case 'listrewards': await handleListRewards(interaction, db); break;
    case 'rolelist': await handleRoleList(interaction, db); break;
    case 'force_refresh_rewards': await handleForceRefreshRewards(interaction, db); break;
    case 'cleanup_roles': await handleCleanupRoles(interaction, db); break;
    case 'account_linking': await handleAccountLinking(interaction, db); break;
    case 'set_winlog': await handleSetWinlog(interaction, db); break;
  }
  return true;
}
