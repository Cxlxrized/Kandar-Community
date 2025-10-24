import { EmbedBuilder } from 'discord.js';

export default (client) => {
  client.on('guildMemberAdd', async member => {
    try {
      const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
      const channel = member.guild.channels.cache.get(welcomeChannelId);
      if (!channel) return console.log('⚠️ Welcome Channel nicht gefunden!');

      const embed = new EmbedBuilder()
        .setColor('#00FFAA')
        .setTitle(`👋 Willkommen ${member.user.username}!`)
        .setDescription(
          `Schön, dass du auf **${member.guild.name}** bist!\n\n` +
          `Du bist unser **${member.guild.memberCount}. Mitglied 🎉**\n` +
          `➡️ Schau dich gerne um & viel Spaß!`
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'Kandar Community', iconURL: member.guild.iconURL({ dynamic: true }) })
        .setTimestamp();

      await channel.send({ content: `${member}`, embeds: [embed] });
    } catch (err) {
      console.error('Welcome Embed Error:', err);
    }
  });
};
