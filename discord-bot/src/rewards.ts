/**
 * Reward role assignment, triggered immediately after points/wins are awarded
 * (replaces the Python bot's periodic `monitor_rewards` polling loop).
 *
 * Call `checkAndAssignRewards(guild, db, userId)` right after any
 * `db.addPoints(...)` / `db.addWins(...)` call that affects `userId`.
 *
 * Wire-up:
 *   - In territorial_commands.ts (handleAdd, handleAddScore, handleAddWin,
 *     and their remove/negative counterparts — eligibility can drop too if
 *     you want downgrade-on-removal; see note below) and in winlog.ts
 *     (addWinlogPoints / claim handler), after writing points/wins:
 *
 *       await checkAndAssignRewards(interaction.guild, db, targetUserId);
 *
 *     (winlog.ts already has `guild` in scope.)
 *
 * Behavior mirrors force_refresh_rewards / monitor_rewards:
 *   - For each of points & wins independently, find the highest reward role
 *     the user newly qualifies for.
 *   - If they don't have it, remove any lower milestone roles of the same
 *     type and add the new one.
 *   - No-op if they already hold the highest eligible role.
 *   - Roles/members not resolvable are skipped silently (logged at debug).
 */
import { Guild } from 'discord.js';
import { Database } from './database';

type RewardType = 'points' | 'wins';

/**
 * Check a single user's points/wins totals against configured reward roles
 * for this guild and assign the highest-eligible role per type, removing any
 * lower milestone roles of the same type.
 */
export async function checkAndAssignRewards(guild: Guild, db: Database, userId: string): Promise<void> {
  const rewards = await db.getRewardRoles(guild.id);
  if (!rewards.length) return;

  const pointsRewards = rewards.filter((r) => r.type === 'points');
  const winsRewards = rewards.filter((r) => r.type === 'wins');
  if (!pointsRewards.length && !winsRewards.length) return;

  let member = guild.members.cache.get(userId);
  if (!member) {
    try {
      member = await guild.members.fetch(userId);
    } catch {
      return; // user left the guild or is unfetchable
    }
  }
  if (member.user.bot) return;

  for (const [type, typeRewards] of [['points', pointsRewards], ['wins', winsRewards]] as [RewardType, typeof pointsRewards][]) {
    if (!typeRewards.length) continue;

    const total = await db.getUserTotal(type, guild.id, userId);

    let highest: typeof typeRewards[number] | null = null;
    for (const reward of typeRewards) {
      if (total >= reward.amount && (!highest || reward.amount > highest.amount)) highest = reward;
    }
    if (!highest) continue;

    const role = guild.roles.cache.get(highest.role_id);
    if (!role) continue;
    if (member.roles.cache.has(role.id)) continue; // already has the right role

    try {
      const lowerRoles = typeRewards
        .filter((r) => r.amount < highest!.amount)
        .map((r) => guild.roles.cache.get(r.role_id))
        .filter((r): r is NonNullable<typeof r> => !!r && member!.roles.cache.has(r.id));

      if (lowerRoles.length) {
        await member.roles.remove(lowerRoles, 'Reward upgrade: replaced by higher milestone role');
      }
      await member.roles.add(role, `Reward milestone reached: ${total.toLocaleString()} ${type}`);

      const channel = guild.channels.cache.get(highest.channel_id);
      if (channel && 'send' in channel && typeof channel.send === 'function') {
        try {
          await (channel as import('discord.js').TextChannel).send({
            content: `Congratulations ${member.toString()}, you have reached ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${type} and you are rewarded with ${role.toString()}`,
          });
        } catch {
          /* ignore send failures */
        }
      }
    } catch {
      // missing permissions / role hierarchy issue — skip silently
    }
  }
}
