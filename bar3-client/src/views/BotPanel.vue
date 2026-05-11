<template>
  <div class="pa-4">
    <div class="text-h5 white--text font-weight-medium mb-6">
      <v-icon color="primary" class="mr-2">mdi-robot</v-icon>
      Bot Panel
    </div>

    <!-- Send message section -->
    <v-card dark color="#1A1A1A" class="mb-6 pa-4">
      <div class="text-subtitle-1 white--text font-weight-medium mb-3">
        <v-icon small class="mr-1">mdi-send</v-icon>
        Send Bot Message
      </div>
      <v-textarea
        v-model="messageContent"
        label="Message content"
        dark
        dense
        outlined
        color="primary"
        rows="3"
        auto-grow
        :disabled="sendLoading"
        class="mb-2"
      />
      <v-alert v-if="sendError" type="error" dense class="mb-2">{{ sendError }}</v-alert>
      <v-alert v-if="sendSuccess" type="success" dense class="mb-2">Message sent!</v-alert>
      <v-btn
        color="primary"
        :loading="sendLoading"
        :disabled="!messageContent.trim()"
        @click="sendMessage"
      >
        <v-icon left>mdi-send</v-icon>
        Send
      </v-btn>
    </v-card>

    <!-- Servers section -->
    <v-card dark color="#1A1A1A" class="mb-6 pa-4">
      <div class="text-subtitle-1 white--text font-weight-medium mb-3">
        <v-icon small class="mr-1">mdi-server</v-icon>
        Servers
      </div>
      <div v-if="serversLoading" class="d-flex justify-center py-4">
        <v-progress-circular indeterminate color="primary" />
      </div>
      <v-alert v-else-if="serversError" type="error" dense>{{ serversError }}</v-alert>
      <v-list v-else-if="servers.length" dense dark color="transparent">
        <v-list-item v-for="server in servers" :key="server.id" class="px-0">
          <v-list-item-avatar size="36" color="#2a2a2a">
            <v-img v-if="server.icon" :src="serverIconUrl(server)" />
            <v-icon v-else small>mdi-discord</v-icon>
          </v-list-item-avatar>
          <v-list-item-content>
            <v-list-item-title class="white--text">{{ server.name }}</v-list-item-title>
            <v-list-item-subtitle>{{ server.memberCount.toLocaleString() }} members</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>
      </v-list>
      <div v-else class="text--secondary caption">No servers found.</div>
    </v-card>

    <!-- Command usage section -->
    <v-card dark color="#1A1A1A" class="pa-4">
      <div class="text-subtitle-1 white--text font-weight-medium mb-3">
        <v-icon small class="mr-1">mdi-slash-forward-box</v-icon>
        Most Used Commands
      </div>
      <div v-if="commandsLoading" class="d-flex justify-center py-4">
        <v-progress-circular indeterminate color="primary" />
      </div>
      <v-alert v-else-if="commandsError" type="error" dense>{{ commandsError }}</v-alert>
      <v-list v-else-if="commands.length" dense dark color="transparent">
        <v-list-item v-for="cmd in commands" :key="cmd.name" class="px-0">
          <v-list-item-content>
            <v-list-item-title class="white--text">
              <span class="primary--text font-weight-bold">/{{ cmd.name }}</span>
              <span class="text--secondary caption ml-2">{{ cmd.description }}</span>
            </v-list-item-title>
          </v-list-item-content>
          <v-list-item-action>
            <v-chip small color="primary" dark>{{ cmd.usageCount.toLocaleString() }}</v-chip>
          </v-list-item-action>
        </v-list-item>
      </v-list>
      <div v-else class="text--secondary caption">No command usage data found.</div>
    </v-card>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { botApi, BotServer, BotCommand } from '@/utilities/botApi';

@Component
export default class BotPanel extends Vue {
  // Send message
  messageContent = '';
  sendLoading = false;
  sendError = '';
  sendSuccess = false;

  // Servers
  servers: BotServer[] = [];
  serversLoading = false;
  serversError = '';

  // Commands
  commands: BotCommand[] = [];
  commandsLoading = false;
  commandsError = '';

  serverIconUrl(server: BotServer): string {
    if (!server.icon || server.icon.includes('{')) return '';
    if (/^https?:\/\//.test(server.icon)) return server.icon;
    return `https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png?size=64`;
  }

  async created() {
    await Promise.all([this.loadServers(), this.loadCommands()]);
  }

  async loadServers() {
    this.serversLoading = true;
    this.serversError = '';
    try {
      this.servers = await botApi.getServers();
    } catch (e) {
      this.serversError = (e as any)?.message || 'Failed to load servers';
    } finally {
      this.serversLoading = false;
    }
  }

  async loadCommands() {
    this.commandsLoading = true;
    this.commandsError = '';
    try {
      this.commands = await botApi.getCommandUsage();
    } catch (e) {
      this.commandsError = (e as any)?.message || 'Failed to load command usage';
    } finally {
      this.commandsLoading = false;
    }
  }

  async sendMessage() {
    if (!this.messageContent.trim()) return;
    this.sendLoading = true;
    this.sendError = '';
    this.sendSuccess = false;
    try {
      await botApi.sendMessage(this.messageContent.trim());
      this.sendSuccess = true;
      this.messageContent = '';
    } catch (e) {
      this.sendError = (e as any)?.message || 'Failed to send message';
    } finally {
      this.sendLoading = false;
    }
  }
}
</script>
