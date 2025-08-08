import { Client, GatewayIntentBits, PermissionsBitField } from 'discord.js';
import dotenv from 'dotenv';

// Lade Umgebungsvariablen aus .env-Datei
dotenv.config();

// Erstelle Discord-Client mit notwendigen Intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Konfiguration des Kanals mit ➕ vor dem Namen
const channelConfig = [
  {
    id: process.env.CHANNEL_ID,
    name: '➕Voice Kanal erstellen',
    prefix: null, // Wird durch Benutzernamen ersetzt
    memberLimit: 0, // 0 = unbegrenzt
  },
];

// Map zur Verfolgung erstellter Kanäle
const createdChannels = new Map();

// Generiere den nächsten Kanalnamen basierend auf vorhandenen Kanälen (falls benötigt, aber hier nicht verwendet)
function getNextChannelName(guild, prefix) {
  const existingChannels = guild.channels.cache
    .filter((channel) => channel.name.startsWith(prefix))
    .map((channel) => channel.name);
  let index = 1;
  while (existingChannels.includes(`${prefix}${index}`)) {
    index++;
  }
  return `${prefix}${index}`;
}

// Behandle Voice State Updates
client.on('voiceStateUpdate', async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  const member = newState.member || oldState.member;

  // Prüfe, ob ein Benutzer dem Hauptkanal beigetreten ist oder den Kanal gewechselt hat
  if (newState.channelId && (newState.channelId !== oldState.channelId)) {
    const config = channelConfig.find((c) => c.id === newState.channelId);
    if (config) {
      let channelName;
      if (config.prefix === null) {
        channelName = `${member.displayName}'s Kanal`;
      } else {
        channelName = getNextChannelName(guild, config.prefix);
      }
      try {
        // Erstelle neuen Sprachkanal
        const newChannel = await guild.channels.create({
          name: channelName,
          type: 2, // Sprachkanal
          parent: newState.channel.parentId,
          userLimit: config.memberLimit,
          permissionOverwrites: [
            {
              id: guild.id,
              allow: [PermissionsBitField.Flags.ViewChannel],
              deny: [
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.ManageRoles,
              ],
            },
            {
              id: member.id,
              deny: [
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.ManageRoles,
              ],
            },
          ],
        });

        // Verschiebe den Benutzer in den neuen Kanal
        await member.voice.setChannel(newChannel);

        // Speichere den Kanal in der Map
        createdChannels.set(newChannel.id, {
          creatorId: member.id,
          config,
        });

        console.log(`Kanal ${channelName} für ${member.displayName} erstellt.`);
      } catch (error) {
        console.error('Fehler beim Erstellen des Kanals:', error);
      }
    }
  }

  // Prüfe, ob ein Benutzer einen Kanal verlassen hat (Disconnect oder Kanalwechsel)
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    const channel = guild.channels.cache.get(oldState.channelId);
    if (channel && createdChannels.has(channel.id) && channel.members.size === 0) {
      try {
        await channel.delete();
        createdChannels.delete(channel.id);
        console.log(`Kanal ${channel.name} gelöscht, da leer.`);
      } catch (error) {
        console.error('Fehler beim Löschen des Kanals:', error);
      }
    }
  }
});

// Periodische Cleanup-Funktion für leere Kanäle
async function cleanupEmptyChannels() {
  for (const [channelId, data] of createdChannels.entries()) {
    const channel = client.channels.cache.get(channelId);
    if (channel && channel.members.size === 0) {
      try {
        await channel.delete();
        createdChannels.delete(channelId);
        console.log(`Kanal ${channel.name} via Cleanup gelöscht.`);
      } catch (error) {
        console.error('Fehler beim Cleanup-Löschen:', error);
      }
    }
  }
}

// Bot-Login
client.once('ready', () => {
  console.log(`Eingeloggt als ${client.user.tag}`);
  setInterval(cleanupEmptyChannels, 300000); // Alle 5 Minuten
});

client.login(process.env.DISCORD_TOKEN);

// Export für ES-Module (falls benötigt)
export { client };
