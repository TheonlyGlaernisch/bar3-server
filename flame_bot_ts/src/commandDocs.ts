export interface CommandDoc {
  name: string;
  summary: string;
  category: 'core' | 'alliance' | 'gov' | 'admin' | 'fun' | 'setup';
}

// Python grouped-command parity matrix:
// /admin welcome set_message -> canonical /welcome_set (alias /admin_welcome_set_message)
// /admin welcome set_channel -> canonical /welcome_channel_set (alias /admin_welcome_set_channel)
// /admin welcome toggle true|false -> canonical /welcome_enable|/welcome_disable (aliases /admin_welcome_enable|/admin_welcome_disable)
// /admin welcome show -> canonical /welcome_show (alias /admin_welcome_show)
// /admin sync -> canonical /admin_sync_commands (alias /admin_sync)
// /admin clear_guild_commands -> canonical /admin_clear_guild_commands (alias /admin_clear)

export const COMMAND_DOCS: CommandDoc[] = [
  { name: '/register <nation_id>', summary: 'Link your Discord account to a nation after Discord-tag verification.', category: 'core' },
  { name: '/unregister', summary: 'Remove your nation registration.', category: 'core' },
  { name: '/whois <query>', summary: 'Look up a nation by ID, name, mention, or stored username.', category: 'core' },
  { name: '/test_whois <query>', summary: 'Run whois lookup against test API data.', category: 'core' },
  { name: '/alliance_info <query>', summary: 'Show alliance statistics by ID or name.', category: 'alliance' },
  { name: '/test_alliance_info <query>', summary: 'Alliance stats lookup against test API.', category: 'alliance' },
  { name: '/alliance_members <query>', summary: 'List top alliance members by score.', category: 'alliance' },
  { name: '/test_alliance_members <query>', summary: 'List top members from test API alliance lookup.', category: 'alliance' },
  { name: '/alliance_lots_of_info <query>', summary: 'Detailed alliance briefing: tiers, beige count, and top members.', category: 'alliance' },
  { name: '/test_alliance_lots_of_info <query>', summary: 'Detailed alliance briefing for test API.', category: 'alliance' },
  { name: '/color', summary: 'Check active member color compliance for primary alliance.', category: 'alliance' },
  { name: '/damage_leaderboard', summary: '7-day ranked damage output for primary alliance.', category: 'alliance' },
  { name: '/missile_targets_find', summary: 'Show slotter alliance targets; highlight those in your missile range.', category: 'alliance' },
  { name: '/spy_target_find', summary: 'Show slotter alliance targets; highlight those in your spy range.', category: 'alliance' },
  { name: '/war_range_targets', summary: 'Show slotter alliance targets; highlight those in your war range.', category: 'alliance' },
  { name: '/infra <from> <to> [cities] [projects]', summary: 'Calculate infrastructure purchase cost with optional project discounts.', category: 'core' },
  { name: '/city_cost <current> [target] [policies]', summary: 'Calculate city purchase costs using the dynamic formula.', category: 'core' },
  { name: '/revenue [query]', summary: 'Show estimated gross daily revenue for a nation; defaults to your registered nation.', category: 'core' },
  { name: '/send ...resources', summary: 'Compose Locutus transfer command with full resource payload.', category: 'core' },
  { name: '/request_grant <note> [resources]', summary: 'Submit grant request to configured grant channel.', category: 'gov' },
  { name: '/slots', summary: 'Show open defensive slots for configured alliances.', category: 'alliance' },
  { name: '/config_slots_set <ids>', summary: 'Set slot-tracked alliance list for this guild.', category: 'setup' },
  { name: '/config_slots_show', summary: 'Display configured slot alliance list.', category: 'setup' },
  { name: '/config_slots_clear', summary: 'Clear slot alliance list.', category: 'setup' },
  { name: '/setup_war_alerts_add <channel>', summary: 'Subscribe channel to alliance war alerts.', category: 'setup' },
  { name: '/setup_war_alerts_remove <channel>', summary: 'Remove war alert subscription from channel.', category: 'setup' },
  { name: '/setup_war_alerts_list', summary: 'List current war alert subscriptions.', category: 'setup' },
  { name: '/roles_setup ...', summary: 'Configure gov role mappings.', category: 'setup' },
  { name: '/roles_show', summary: 'Show current gov role mappings.', category: 'setup' },
  { name: '/gov', summary: 'Show members currently mapped to gov departments.', category: 'gov' },
  { name: '/setup_grant_channel <channel>', summary: 'Set grant request destination channel.', category: 'setup' },
  { name: '/welcome_set <message>', summary: 'Set welcome message template.', category: 'setup' },
  { name: '/welcome_channel_set <channel>', summary: 'Set welcome channel.', category: 'setup' },
  { name: '/welcome_enable', summary: 'Enable welcome automation.', category: 'setup' },
  { name: '/welcome_disable', summary: 'Disable welcome automation.', category: 'setup' },
  { name: '/welcome_show', summary: 'Show current welcome configuration.', category: 'setup' },
  { name: '/setup_recruiter_add <channel>', summary: 'Add recruiter subscription channel.', category: 'setup' },
  { name: '/setup_recruiter_remove <channel>', summary: 'Remove recruiter subscription channel.', category: 'setup' },
  { name: '/setup_recruiter_list', summary: 'List recruiter subscription channels.', category: 'setup' },
  { name: '/admin_alliance_set <id>', summary: 'Set this guild primary alliance ID.', category: 'admin' },
  { name: '/admin_alliance_show', summary: 'Show this guild primary alliance ID.', category: 'admin' },
  { name: '/admin_api_key_set <api_key>', summary: 'Persist and apply runtime PnW API key.', category: 'admin' },
  { name: '/admin_sync_commands', summary: 'Sync slash commands now (canonical).', category: 'admin' },
  { name: '/admin_sync', summary: 'Compatibility alias for /admin_sync_commands.', category: 'admin' },
  { name: '/admin_clear_guild_commands', summary: 'Clear guild-scoped commands (canonical).', category: 'admin' },
  { name: '/admin_clear', summary: 'Compatibility alias for /admin_clear_guild_commands.', category: 'admin' },
  { name: '/welcome_set <message>', summary: 'Set welcome message template (canonical).', category: 'setup' },
  { name: '/admin_welcome_set_message <message>', summary: 'Compatibility alias for /welcome_set.', category: 'setup' },
  { name: '/welcome_channel_set <channel>', summary: 'Set welcome channel (canonical).', category: 'setup' },
  { name: '/admin_welcome_set_channel <channel>', summary: 'Compatibility alias for /welcome_channel_set.', category: 'setup' },
  { name: '/admin_welcome_enable', summary: 'Compatibility alias for /welcome_enable.', category: 'setup' },
  { name: '/admin_welcome_disable', summary: 'Compatibility alias for /welcome_disable.', category: 'setup' },
  { name: '/admin_welcome_show', summary: 'Compatibility alias for /welcome_show.', category: 'setup' },
  { name: '/fun_quote', summary: 'Return a random legacy quote.', category: 'fun' },
  { name: '/suggestion <content>', summary: 'Submit suggestion for bot development.', category: 'fun' },
  { name: '/help', summary: 'Display command help by category.', category: 'core' },
];

export function renderCommandHelp(): string {
  const byCategory = new Map<string, CommandDoc[]>();
  for (const doc of COMMAND_DOCS) {
    const arr = byCategory.get(doc.category) ?? [];
    arr.push(doc);
    byCategory.set(doc.category, arr);
  }
  const sections: string[] = [];
  for (const [category, docs] of byCategory.entries()) {
    sections.push(`**${category.toUpperCase()}**`);
    for (const d of docs) {
      sections.push(`• ${d.name} — ${d.summary}`);
    }
    sections.push('');
  }
  return sections.join('\n').trim();
}
