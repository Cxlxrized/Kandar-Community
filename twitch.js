import fetch from 'node-fetch';
import { EmbedBuilder } from 'discord.js';

let isLive = false;

export default (client) => {
  async function checkTwitchStream() {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    const username = process.env.TWITCH_CHANNEL_NAME;
    const announceChannelId = process.env.STREAM_ANNOUNCE_CHANNEL_ID;

    try {
      const tokenRes = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, { method: 'POST' });
      const tokenData = await tokenRes.json();
      const token = tokenData.access_token;

      const userRes = await fetch(`https://api.twitch.tv/helix/streams?user_login=${username}`, {
        headers: { 'Client-ID': clientId, 'Authorization': `Bearer ${token}` }
      });
      const streamData = await userRes.json();

      const channel = await client.channels.fetch(announceChannelId);

      if (streamData.data && streamData.data.length > 0) {
        if (!isLive) {
          isLive = true;
          const stream = streamData.data[0];
          const embed = new EmbedBuilder()
            .setTitle(`${username} ist jetzt live auf Twitch!`)
            .setDescription(`[Hier klicken, um zu schauen](https://twitch.tv/${username})`)
            .setColor('#9146FF')
            .setThumbnail(stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180'))
            .addFields(
              { name: 'Titel', value: stream.title || 'Kein Titel', inline: false },
              { name: 'Spiel', value: stream.game_name || 'Kein Spiel angegeben', inline: true }
            )
            .setFooter({ text: 'Kandar Community' })
            .setTimestamp();

          channel.send({ embeds: [embed] });
        }
      } else {
        isLive = false;
      }
    } catch (err) {
      console.error('Fehler beim Twitch-Check:', err);
    }
  }

  // Alle 60 Sekunden prüfen
  setInterval(() => checkTwitchStream(), 60000);
};
