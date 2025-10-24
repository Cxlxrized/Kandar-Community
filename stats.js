import { ChannelType } from 'discord.js';
import fetch from 'node-fetch';

/**
 * Startet die Twitch- und Server-Stats Aktualisierung.
 * Erwartet den Discord Client aus index.js.
 */
export default function startStats(client) {
  // Konfiguration aus .env
  const GUILD_ID = process.env.GUILD_ID;
  const TWITCH_USERNAME = process.env.TWITCH_USERNAME;
  const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
  const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
  const UPDATE_INTERVAL_MS = Number(process.env.STATS_INTERVAL_MS) || 60_000;

  let twitchToken = '';
  let twitchTokenExpiry = 0;

  async function getTwitchToken() {
    const resp = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(TWITCH_CLIENT_ID)}&client_secret=${encodeURIComponent(TWITCH_CLIENT_SECRET)}&grant_type=client_credentials`,
      { method: 'POST' }
    );
    const data = await resp.json();
    twitchToken = data.access_token;
    twitchTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000 - 30_000;
  }

  async function ensureTwitchToken() {
    if (!twitchToken || Date.now() >= twitchTokenExpiry) await getTwitchToken();
  }

  async function getTwitchUser() {
    await ensureTwitchToken();
    const resp = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(TWITCH_USERNAME)}`, {
      headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${twitchToken}` },
    });
    const data = await resp.json();
    return data.data?.[0] ?? null;
  }

  async function getFollowers(userId) {
    await ensureTwitchToken();
    const resp = await fetch(`https://api.twitch.tv/helix/users/follows?to_id=${userId}`, {
      headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${twitchToken}` },
    });
    const data = await resp.json();
    return data.total ?? 0;
  }

  async function getStreamViewers(userId) {
    await ensureTwitchToken();
    const resp = await fetch(`https://api.twitch.tv/helix/streams?user_id=${userId}`, {
      headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${twitchToken}` },
    });
    const data = await resp.json();
    const stream = data.data?.[0] ?? null;
    return stream ? stream.viewer_count || 0 : 0;
  }

  async function updateVoiceChannels() {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      await guild.members.fetch();

      const twitchUser = await getTwitchUser();
      let followers = 0, viewers = 0;
      if (twitchUser) {
        followers = await getFollowers(twitchUser.id);
        viewers = await getStreamViewers(twitchUser.id);
      }

      const channels = guild.channels.cache;

      const followersChannel = channels.find(c => c.type === ChannelType.GuildVoice && c.name.toLowerCase().includes('twitch-follower'));
      if (followersChannel) await followersChannel.setName(`Followers: ${followers}`);

      const viewersChannel = channels.find(c => c.type === ChannelType.GuildVoice && c.name.toLowerCase().includes('twitch-viewer'));
      if (viewersChannel) await viewersChannel.setName(`Viewer: ${viewers}`);

      const membersChannel = channels.find(c => c.type === ChannelType.GuildVoice && c.name.toLowerCase().includes('members'));
      if (membersChannel) await membersChannel.setName(`Members: ${guild.memberCount}`);

      const botsChannel = channels.find(c => c.type === ChannelType.GuildVoice && c.name.toLowerCase().includes('bots'));
      if (botsChannel) {
        const botCount = guild.members.cache.filter(m => m.user?.bot).size;
        await botsChannel.setName(`Bots: ${botCount}`);
      }
    } catch (err) {
      console.error('❌ Fehler beim Aktualisieren der Voice-Channels:', err);
    }
  }

  client.once('ready', () => {
    console.log('📊 Stats-Modul gestartet!');
    updateVoiceChannels();
    setInterval(updateVoiceChannels, UPDATE_INTERVAL_MS);
  });
}
