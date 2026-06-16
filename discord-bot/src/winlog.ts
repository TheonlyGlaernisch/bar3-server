/**
 * Winlog handling for the territorial.io points system.
 *
 * Scraping itself is done by the `territorial.io-winlog-worker` Cloudflare
 * Worker, which POSTs a parsed payload to `/api/winlog` on this bot whenever
 * the target clan wins. This module takes that payload and:
 *   - finds guilds with matching `winlog_settings` (clan filter, case-insensitive)
 *   - auto-credits any linked accounts found in the payout list
 *   - posts a claimable win-log embed with 1x / 1.3x / 1.5x buttons
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ComponentType,
  EmbedBuilder,
  TextChannel,
} from 'discord.js';
import { Database } from './database';
import { checkAndAssignRewards } from './rewards';

export interface WinlogPayload {
  winTime: string;
  map: string;
  playerCount: number;
  winningClan: string;
  isContest: boolean;
  points: number;
  prevPoints: string;
  currPoints: string;
  payoutAccounts: string[];
}

const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

async function addWinlogPoints(
  db: Database,
  userId: string,
  userName: string,
  guildId: string,
  guildName: string,
  points: number,
): Promise<number> {
  const multiplierDoc = await db.getActiveMultiplier(guildId);
  const multiplier = multiplierDoc?.multiplier ?? 1.0;
  const finalPoints = points * multiplier;
  const now = new Date();

  await db.addPoints({
    user_id: userId,
    user_name: userName,
    guild_id: guildId,
    guild_name: guildName,
    amount: finalPoints,
    base_amount: points,
    multiplier_used: multiplier,
    type: 'winlog_auto',
    timestamp: now,
  });
  await db.addWins({
    user_id: userId,
    user_name: userName,
    guild_id: guildId,
    guild_name: guildName,
    amount: 1,
    type: 'winlog_auto',
    timestamp: now,
  });

  return finalPoints;
}

function buildWinlogDescription(payload: WinlogPayload, autoCredited: string[]): string {
  const base = payload.isContest
    ? `[${payload.winningClan}] won on ${payload.map} (Contest)\n${payload.playerCount} players x2 = ${payload.points} points available to claim!\n[${payload.prevPoints} → ${payload.currPoints}]`
    : `[${payload.winningClan}] won on ${payload.map}\n${payload.points} points available to claim!\n[${payload.prevPoints} → ${payload.currPoints}]`;
  return autoCredited.length ? `${base}\n\n**Auto-credited:** ${autoCredited.join(', ')}` : base;
}

/**
 * Process an incoming winlog payload from the scraper worker: auto-credit
 * linked accounts and post claimable win-log embeds to every guild whose
 * `winlog_settings.clan_name` matches (case-insensitively).
 */
export async function handleWinlogPayload(client: Client, db: Database, payload: WinlogPayload): Promise<void> {
  const settingsList = await db.getActiveWinlogSettings();
  const winningClanLower = payload.winningClan.trim().toLowerCase();
  // Resolve (or create) the global win record up front so all guilds that
  // process this payload share the same win_id for deduplication.
  const winId = await db.getOrCreateProcessedWin({
    winTime: payload.winTime,
    map: payload.map,
    winningClan: payload.winningClan,
  });

  for (const setting of settingsList) {
    const clanFilter = (setting.clan_name || '').trim().toLowerCase();
    if (clanFilter && clanFilter !== winningClanLower) continue;

    const guild = client.guilds.cache.get(setting.guild_id);
    if (!guild) continue;
    const channel = guild.channels.cache.get(setting.channel_id);
    if (!(channel instanceof TextChannel)) continue;

    // Auto-credit linked accounts found among the payout accounts.
    const autoCredited: string[] = [];
    const links = await db.getAccountLinksForGuild(guild.id);
    for (const payoutAccount of payload.payoutAccounts) {
      const pLower = payoutAccount.toLowerCase();
      const link =
        links.find((l) => l.account_name === payoutAccount) ??
        links.find((l) => l.account_name.toLowerCase() === pLower) ??
        links.find(
          (l) =>
            pLower.includes(l.account_name.toLowerCase()) ||
            l.account_name.toLowerCase().includes(pLower),
        );
      if (!link) continue;

      let member = guild.members.cache.get(link.user_id);
      if (!member) {
        try {
          member = await guild.members.fetch(link.user_id);
        } catch {
          continue;
        }
      }
      if (!member) continue;

      if (await db.hasUserClaimedWin(winId, member.id)) {
        try {
          await member.send({
            embeds: [
              new EmbedBuilder()
                .setTitle('ℹ️ Win Already Claimed')
                .setDescription(
                  `You've already been credited for [${payload.winningClan}] win on ${payload.map}.`,
                )
                .setColor(0x808080),
            ],
          });
        } catch {
          /* ignore DM failures */
        }
      
        continue;
      }

      const finalPoints = await addWinlogPoints(
        db,
        member.id,
        member.user.tag,
        guild.id,
        guild.name,
        payload.points,
      );
      await checkAndAssignRewards(guild, db, member.id);
      await db.recordWinClaim(winId, member.id, member.user.tag, finalPoints, 'auto_credit');
      autoCredited.push(member.toString());

      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle('🎉 Auto-Credited Points!')
          .setDescription(
            `You received **${finalPoints.toLocaleString(undefined, { maximumFractionDigits: 1 })} points** ` +
              `and **1 win** from [${payload.winningClan}] win on ${payload.map}!\n\nAccount: \`${payoutAccount}\`` +
              (payload.isContest ? '\n*Contest game - double points!*' : ''),
          )
          .setColor(0x00ff00);
        await member.send({ embeds: [dmEmbed] });
      } catch {
        /* ignore DM failures */
      }
    }

    const description = buildWinlogDescription(payload, autoCredited);
    const embed = new EmbedBuilder()
      .setTitle('🏆 Win Log')
      .setDescription(description)
      .setColor(0x00ff00)
      .setFooter({ text: 'Click to claim points • Expires in 5 minutes' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('winlog_claim_1x').setLabel('Claim (1x)').setStyle(ButtonStyle.Secondary).setEmoji('🎯'),
      new ButtonBuilder().setCustomId('winlog_claim_13x').setLabel('DUO win (x1.3)').setStyle(ButtonStyle.Primary).setEmoji('🤝'),
      new ButtonBuilder().setCustomId('winlog_claim_15x').setLabel('SOLO win (x1.5)').setStyle(ButtonStyle.Success).setEmoji('👑'),
    );

    let message;
    try {
      message = await channel.send({ embeds: [embed], components: [row] });
    } catch {
      continue;
    }

    const claimedUsers = new Map<string, number>(); // userId -> multiplier
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: CLAIM_TIMEOUT_MS,
    });

    collector.on('collect', async (btn) => {
      const multiplier =
        btn.customId === 'winlog_claim_1x' ? 1.0 : btn.customId === 'winlog_claim_13x' ? 1.3 : 1.5;

      if (claimedUsers.has(btn.user.id)) {
        await btn.reply({ content: '❌ You already claimed points from this log!', ephemeral: true });
        return;
      }
      if (await db.hasUserClaimedWin(winId, btn.user.id)) {
        await btn.reply({
          content: '❌ This win has already been claimed (you were already credited for it).',
          ephemeral: true,
        });
      
        return;
      }
      claimedUsers.set(btn.user.id, multiplier);

      const finalPoints = await addWinlogPoints(
        db,
        btn.user.id,
        btn.user.tag,
        guild.id,
        guild.name,
        payload.points * multiplier,
      );
      await checkAndAssignRewards(guild, db, btn.user.id);
      await db.recordWinClaim(winId, btn.user.id, btn.user.tag, finalPoints, 'button_claim');

      const serverMultiplierDoc = await db.getActiveMultiplier(guild.id);
      const serverMultiplier = serverMultiplierDoc?.multiplier ?? 1.0;
      const displayPoints = finalPoints * serverMultiplier;

      const claimedMentions = [...claimedUsers.entries()].map(([uid, mult]) => `<@${uid}> (${mult}x)`);
      const updatedEmbed = new EmbedBuilder()
        .setTitle('🏆 Win Log')
        .setDescription(description)
        .setColor(0x00ff00)
        .addFields({ name: 'Claimed by', value: claimedMentions.slice(0, 10).join('\n'), inline: false })
        .setFooter({ text: 'Click to claim points • Expires in 5 minutes' });

      try {
        await message.edit({ embeds: [updatedEmbed], components: [row] });
      } catch {
        /* ignore */
      }

      let replyDesc = `You received **${displayPoints.toLocaleString(undefined, { maximumFractionDigits: 1 })} points** and **1 win**!`;
      if (multiplier > 1.0) {
        replyDesc += `\n*Base: ${payload.points} x ${multiplier} = ${(payload.points * multiplier).toFixed(1)} points*`;
      }
      if (serverMultiplier > 1.0) {
        replyDesc += `\n*Server multiplier: ${serverMultiplier}x*`;
      }
      await btn.reply({
        embeds: [new EmbedBuilder().setTitle('✅ Points Claimed!').setDescription(replyDesc).setColor(0x00ff00)],
        ephemeral: true,
      });
    });

    collector.on('end', async () => {
      const claimedMentions = [...claimedUsers.entries()].map(([uid, mult]) => `<@${uid}> (${mult}x)`);
      const expiredEmbed = new EmbedBuilder()
        .setTitle('⏰ Win Log Expired')
        .setDescription(description)
        .setColor(0x808080)
        .setFooter({ text: 'This win log has expired' });
      if (claimedMentions.length) {
        expiredEmbed.addFields({ name: 'Claimed by', value: claimedMentions.slice(0, 10).join('\n'), inline: false });
      }
      try {
        await message.edit({ embeds: [expiredEmbed], components: [] });
      } catch {
        /* ignore */
      }
    });
  }
}
