export interface CommandDoc {
  name: string;
  summary: string;
  category: 'core' | 'alliance' | 'gov' | 'admin' | 'fun' | 'setup' | 'territorial';
}

export const COMMAND_DOCS: CommandDoc[] = [
  { name: '/register <nation_id>', summary: 'Link your Discord account to a nation after Discord-tag verification.', category: 'core' },
  { name: '/unregister', summary: 'Remove your nation registration.', category: 'core' },
  { name: '/whois <query>', summary: 'Look up a nation by ID, name, mention, or stored username.', category: 'core' },
  { name: '/test whois <query>', summary: 'Run whois lookup against test API data.', category: 'core' },
  { name: '/alliance info <query>', summary: 'Show alliance statistics by ID or name.', category: 'alliance' },
  { name: '/test alliance info <query>', summary: 'Alliance stats lookup against test API.', category: 'alliance' },
  { name: '/alliance members <query>', summary: 'List top alliance members by score.', category: 'alliance' },
  { name: '/test alliance members <query>', summary: 'List top members from test API alliance lookup.', category: 'alliance' },
  { name: '/alliance lots_of_info <query>', summary: 'Detailed alliance briefing with QuickChart tier graph, beige count, and top members.', category: 'alliance' },
  { name: '/test alliance lots_of_info <query>', summary: 'Detailed alliance briefing for test API with QuickChart tier graph.', category: 'alliance' },
  { name: '/color', summary: 'Check active member color compliance for primary alliance.', category: 'alliance' },
  { name: '/damage leaderboard', summary: '7-day ranked damage output for primary alliance.', category: 'alliance' },
  { name: '/missile targets find', summary: 'Show slotter alliance targets; highlight those in your missile range.', category: 'alliance' },
  { name: '/spy target find', summary: 'Show slotter alliance targets; highlight those in your spy range.', category: 'alliance' },
  { name: '/war range targets', summary: 'Show slotter alliance targets; highlight those in your war range.', category: 'alliance' },
  { name: '/infra <from> <to> [cities] [projects]', summary: 'Calculate infrastructure purchase cost with optional project discounts.', category: 'core' },
  { name: '/city cost <current> [target] [policies]', summary: 'Calculate city purchase costs using the dynamic formula.', category: 'core' },
  { name: '/revenue [query]', summary: 'Show estimated gross daily revenue for a nation; defaults to your registered nation.', category: 'core' },
  { name: '/loot <days> <nation>', summary: 'Summarize ground and victory loot from a nation\'s wars opened in the past N days.', category: 'core' },
  { name: '/send ...resources', summary: 'Compose Locutus transfer command with full resource payload.', category: 'core' },
  { name: '/request grant <note> [resources]', summary: 'Submit grant request to configured grant channel.', category: 'gov' },
  { name: '/banking withdraw [resources]', summary: 'Withdraw resources from offshore to your registered nation balance.', category: 'core' },
  { name: '/banking manual_offshore [resources]', summary: 'Gov/admin command to manually send alliance-bank funds offshore.', category: 'gov' },
  { name: '/slots', summary: 'Show open defensive slots for configured alliances.', category: 'alliance' },
  { name: '/config slots set <ids>', summary: 'Set slot-tracked alliance list for this guild.', category: 'setup' },
  { name: '/config slots show', summary: 'Display configured slot alliance list.', category: 'setup' },
  { name: '/config slots clear', summary: 'Clear slot alliance list.', category: 'setup' },
  { name: '/setup war_alerts add <channel>', summary: 'Subscribe channel to alliance war alerts.', category: 'setup' },
  { name: '/setup war_alerts remove <channel>', summary: 'Remove war alert subscription from channel.', category: 'setup' },
  { name: '/setup war_alerts list', summary: 'List current war alert subscriptions.', category: 'setup' },
  { name: '/roles setup ...', summary: 'Configure gov role mappings.', category: 'setup' },
  { name: '/roles show', summary: 'Show current gov role mappings.', category: 'setup' },
  { name: '/gov', summary: 'Show server members who hold a configured government role.', category: 'gov' },
  { name: '/verify_alliance_server', summary: 'Generate in-game verification message(s) and a one-time code for alliance ownership check.', category: 'gov' },
  { name: '/verify_alliance_server_confirm', summary: 'Legacy helper; use the Verify code button popup from /verify_alliance_server.', category: 'gov' },
  { name: '/chanel_set type:counter action:set <channel>', summary: 'Set Bar3 counter-request destination channel (verified guilds only).', category: 'gov' },
  { name: '/chanel_set type:counter action:show', summary: 'Show configured Bar3 counter-request destination channel.', category: 'gov' },
  { name: '/chanel_set type:counter action:clear', summary: 'Clear configured Bar3 counter-request destination channel.', category: 'gov' },
  { name: '/chanel_set type:grant action:set <channel>', summary: 'Set grant request destination channel.', category: 'setup' },
  { name: '/admin welcome set_message <message>', summary: 'Set welcome message template.', category: 'setup' },
  { name: '/chanel_set type:welcome action:set <channel>', summary: 'Set welcome channel.', category: 'setup' },
  { name: '/admin welcome toggle enabled:true', summary: 'Enable welcome automation.', category: 'setup' },
  { name: '/admin welcome toggle enabled:false', summary: 'Disable welcome automation.', category: 'setup' },
  { name: '/chanel_set type:welcome action:show', summary: 'Show current welcome configuration.', category: 'setup' },
  { name: '/setup recruiter add <channel>', summary: 'Add recruiter subscription channel.', category: 'setup' },
  { name: '/setup recruiter remove <channel>', summary: 'Remove recruiter subscription channel.', category: 'setup' },
  { name: '/setup recruiter list', summary: 'List recruiter subscription channels.', category: 'setup' },
  { name: '/translation enable <channel>', summary: 'Enable English↔Croatian translation replies in a channel.', category: 'setup' },
  { name: '/set field:alliance_id value:<id>', summary: 'Set this guild primary alliance ID.', category: 'admin' },
  { name: '/admin alliance_show', summary: 'Show this guild primary alliance ID.', category: 'admin' },
  { name: '/set field:api_key value:<api_key>', summary: 'Persist and apply runtime PnW API key.', category: 'admin' },
  { name: '/admin sync', summary: 'Sync slash commands now.', category: 'admin' },
  { name: '/admin clear_guild_commands', summary: 'Clear guild-scoped commands.', category: 'admin' },
  { name: '/fun quote', summary: 'Return a random legacy quote.', category: 'fun' },
  { name: '/suggestion <content>', summary: 'Submit suggestion for bot development.', category: 'fun' },
  { name: '/help', summary: 'Display command help by category.', category: 'core' },

  // Territorial.io points / leaderboard / rewards system
  { name: '/bot_manager <role>', summary: 'Configure the bot manager role for territorial commands (Admin only).', category: 'territorial' },
  { name: '/add <points>', summary: 'Add points (and 1 win) to your own balance, multiplied by any active server multiplier.', category: 'territorial' },
  { name: '/remove <points>', summary: 'Remove points (and 1 win) from your own balance.', category: 'territorial' },
  { name: '/addscore <user> <points>', summary: 'Add points to a user (Bot Manager only).', category: 'territorial' },
  { name: '/removescore <user> <points>', summary: 'Remove points from a user (Bot Manager only).', category: 'territorial' },
  { name: '/addwin <user> <wins>', summary: 'Add wins to a user (Bot Manager only).', category: 'territorial' },
  { name: '/removewin <user> <wins>', summary: 'Remove wins from a user (Bot Manager only).', category: 'territorial' },
  { name: '/adminpoints <message_id>', summary: 'Bulk-credit points to users by parsing an existing leaderboard message (Admin only).', category: 'territorial' },
  { name: '/adminwins <message_id>', summary: 'Bulk-credit wins to users by parsing an existing leaderboard message (Admin only).', category: 'territorial' },
  { name: '/leaderboard [days]', summary: 'Show the points/wins leaderboard, with month filter and points/wins toggle.', category: 'territorial' },
  { name: '/leaderboard_week', summary: 'Show the points/wins leaderboard for the last 7 days.', category: 'territorial' },
  { name: '/profile [user]', summary: 'Show points, wins, ranks, and next reward progress for a user.', category: 'territorial' },
  { name: '/set_multiplier <multiplier> <description>', summary: 'Set the server-wide points multiplier (Bot Manager only).', category: 'territorial' },
  { name: '/edit_multiplier <multiplier> <description>', summary: 'Edit the active server multiplier (Bot Manager only).', category: 'territorial' },
  { name: '/end_multiplier', summary: 'Deactivate the server multiplier (Bot Manager only).', category: 'territorial' },
  { name: '/multiplier_info', summary: 'Show the currently active server multiplier, if any.', category: 'territorial' },
  { name: '/rewardrole <channel> <reward_type> <amount> <role>', summary: 'Set a milestone role reward for points or wins (Bot Manager only).', category: 'territorial' },
  { name: '/deletereward <role_id>', summary: 'Delete a configured reward role (Bot Manager only).', category: 'territorial' },
  { name: '/editrewardrole <role> <new_amount> [new_channel]', summary: 'Edit a configured reward role (Bot Manager only).', category: 'territorial' },
  { name: '/listrewards', summary: 'List all configured reward roles (Bot Manager only).', category: 'territorial' },
  { name: '/rolelist', summary: 'Show all reward roles and the points/wins required for each.', category: 'territorial' },
  { name: '/force_refresh_rewards', summary: 'Re-evaluate every member against reward roles and assign/upgrade as needed (Admin only).', category: 'territorial' },
  { name: '/cleanup_roles', summary: 'Remove duplicate milestone roles, keeping only the highest per type (Admin only).', category: 'territorial' },
  { name: '/account_linking <account_name> <user>', summary: 'Link a territorial.io account (5-char name) to a Discord user for auto-credit (Admin only).', category: 'territorial' },
  { name: '/set_winlog <channel> <clan_name>', summary: 'Configure the win-log channel and clan filter (server owner / authorized only).', category: 'territorial' },
];

export interface CommandHelpSection {
  category: CommandDoc['category'];
  body: string;
}

export function renderCommandHelpSections(): CommandHelpSection[] {
  const categories: CommandDoc['category'][] = ['core', 'alliance', 'gov', 'setup', 'admin', 'territorial', 'fun'];
  return categories.map((category) => {
    const docs = COMMAND_DOCS.filter((doc) => doc.category === category);
    const body = docs.map((d) => `• ${d.name} — ${d.summary}`).join('\n');
    return { category, body: body || '*(none)*' };
  });
}
