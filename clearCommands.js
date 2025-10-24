import { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelType
} from 'discord.js';
import fetch from 'node-fetch';
import 'dotenv/config';

// === Client erstellen ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// === Commands definieren ===
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Antwortet mit Pong!'),
  new SlashCommandBuilder().setName('serverstats').setDescription('Zeigt Server-Statistiken an'),
  new SlashCommandBuilder().setName('feedback').setDescription('Gib Feedback für einen Verkäufer')
].map(c => c.toJSON());

// === Commands registrieren / überschreiben ===
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🔄 Commands werden registriert/überschrieben...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.BOT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Commands registriert!');
  } catch (err) {
    console.error('❌ Fehler beim Registrieren der Commands:', err);
  }
})();

// === Dynamische Serverstats-Kanäle erstellen/aktualisieren ===
async function createOrUpdateStatsChannels(guild) {
  try {
    const stats = [
      { name: '👥 Mitglieder', value: guild.memberCount },
      { name: '🚀 Boosts', value: guild.premiumSubscriptionCount },
      { name: '✨ Boost-Level', value: `Tier ${guild.premiumTier}` },
    ];

    for (const stat of stats) {
      let channel = guild.channels.cache.find(c => c.name.includes(stat.name) && c.type === ChannelType.GuildVoice);
      if (!channel) {
        channel = await guild.channels.create({
          name: `${stat.name}: ${stat.value}`,
          type: ChannelType.GuildVoice,
          permissionOverwrites: [{ id: guild.roles.everyone, deny: ['Connect'] }]
        });
      } else {
        await channel.setName(`${stat.name}: ${stat.value}`);
      }
    }

    // Durchschnittssterne aktualisieren
    await updateAverageStarsChannel(guild);

    // Twitch-Kanäle aktualisieren
    await updateTwitchStatsChannel(guild);

    console.log('✅ Serverstats-Kanäle erstellt/aktualisiert');
  } catch (error) {
    console.error('Fehler beim Erstellen/Updaten der Serverstats-Kanäle:', error);
  }
}

// === Durchschnittssterne Channel aktualisieren ===
async function updateAverageStarsChannel(guild) {
  try {
    const feedbackChannel = await guild.channels.fetch(process.env.FEEDBACK_CHANNEL_ID);
    if (!feedbackChannel) return;

    const messages = await feedbackChannel.messages.fetch({ limit: 100 });
    const starValues = [];

    messages.forEach(msg => {
      if (!msg.embeds[0]) return;
      const embed = msg.embeds[0];
      const bewertungField = embed.fields.find(f => f.name === 'Bewertung');
      if (!bewertungField) return;
      const stars = (bewertungField.value.match(/⭐/g) || []).length;
      starValues.push(stars);
    });

    if (starValues.length === 0) return;

    const average = (starValues.reduce((a,b)=>a+b,0)/starValues.length).toFixed(2);

    let avgChannel = guild.channels.cache.find(c => c.name.includes('Durchschnittssterne') && c.type === ChannelType.GuildVoice);
    if (!avgChannel) {
      avgChannel = await guild.channels.create({
        name: `💫 Durchschnittssterne: ${average}`,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [{ id: guild.roles.everyone, deny: ['Connect'] }]
      });
    } else {
      await avgChannel.setName(`💫 Durchschnittssterne: ${average}`);
    }
  } catch (error) {
    console.error('Fehler beim Aktualisieren/Erstellen des Durchschnitts-Channels:', error);
  }
}

// === Twitch Stats aktualisieren (Follower & Subs) ===
async function updateTwitchStatsChannel(guild) {
  try {
    const twitchUsername = process.env.TWITCH_USERNAME;
    const twitchClientId = process.env.TWITCH_CLIENT_ID;
    const twitchToken = process.env.TWITCH_TOKEN;

    // User-ID holen
    const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${twitchUsername}`, {
      headers: {
        'Client-ID': twitchClientId,
        'Authorization': `Bearer ${twitchToken}`
      }
    });
    const userData = await userRes.json();
    if (!userData.data || !userData.data[0]) return;
    const userId = userData.data[0].id;

    // Follower
    const followersRes = await fetch(`https://api.twitch.tv/helix/users/follows?to_id=${userId}`, {
      headers: {
        'Client-ID': twitchClientId,
        'Authorization': `Bearer ${twitchToken}`
      }
    });
    const followersData = await followersRes.json();
    const followersCount = followersData.total || 0;

    // Subscriber (optional, requires OAuth with scope)
    let subsCount = 0;
    try {
      const subsRes = await fetch(`https://api.twitch.tv/helix/subscriptions?broadcaster_id=${userId}`, {
        headers: {
          'Client-ID': twitchClientId,
          'Authorization': `Bearer ${twitchToken}`
        }
      });
      const subsData = await subsRes.json();
      subsCount = subsData.total || 0;
    } catch(e) {
      console.log('Twitch Subs können nicht abgefragt werden. (OAuth scope missing)');
    }

    // Follower Channel
    let followerChannel = guild.channels.cache.find(c => c.name.includes('Twitch Follower') && c.type === ChannelType.GuildVoice);
    if (!followerChannel) {
      followerChannel = await guild.channels.create({
        name: `📺 Twitch Follower: ${followersCount}`,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [{ id: guild.roles.everyone, deny: ['Connect'] }]
      });
    } else {
      await followerChannel.setName(`📺 Twitch Follower: ${followersCount}`);
    }

    // Subs Channel
    let subsChannel = guild.channels.cache.find(c => c.name.includes('Twitch Subs') && c.type === ChannelType.GuildVoice);
    if (!subsChannel) {
      subsChannel = await guild.channels.create({
        name: `⭐ Twitch Subs: ${subsCount}`,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [{ id: guild.roles.everyone, deny: ['Connect'] }]
      });
    } else {
      await subsChannel.setName(`⭐ Twitch Subs: ${subsCount}`);
    }

  } catch (error) {
    console.error('Fehler beim Aktualisieren/Erstellen der Twitch-Kanäle:', error);
  }
}

// === Bot ready ===
client.once('ready', async () => {
  console.log(`🤖 Bot ist online als ${client.user.tag}`);
  client.guilds.cache.forEach(guild => {
    createOrUpdateStatsChannels(guild);
  });

  // Twitch Stats alle 5 Minuten updaten
  setInterval(() => {
    client.guilds.cache.forEach(guild => {
      updateTwitchStatsChannel(guild);
    });
  }, 5 * 60 * 1000);
});

// === Interaction Listener ===
client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isCommand()) {
      // Ping
      if (interaction.commandName === 'ping') {
        await interaction.reply('🏓 Pong!');
        return;
      }

      // Serverstats
      if (interaction.commandName === 'serverstats') {
        const guild = interaction.guild;
        const totalMembers = guild.memberCount;
        const boosts = guild.premiumSubscriptionCount;
        const boostTier = guild.premiumTier;

        const statsEmbed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle(`📊 Server Stats für ${guild.name}`)
          .addFields(
            { name: '👥 Mitglieder', value: `${totalMembers}`, inline: true },
            { name: '🚀 Server-Boosts', value: `${boosts}`, inline: true },
            { name: '✨ Boost-Level', value: `Tier ${boostTier}`, inline: true }
          )
          .setFooter({ text: 'Kandar Community' })
          .setTimestamp();

        await interaction.reply({ embeds: [statsEmbed] });
        await createOrUpdateStatsChannels(guild);
        return;
      }

      // Feedback Dropdown
      if (interaction.commandName === 'feedback') {
        const options = interaction.guild.members.cache
          .filter(m => !m.user.bot)
          .map(m => ({ label: m.user.username, value: m.id }))
          .slice(0, 25);

        const dropdown = new StringSelectMenuBuilder()
          .setCustomId('feedbackSelectSeller')
          .setPlaceholder('Wähle einen Verkäufer aus')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(dropdown);

        await interaction.reply({
          content: 'Bitte wähle einen Verkäufer aus:',
          components: [row],
          ephemeral: true
        });
        return;
      }
    }

    // Dropdown Auswahl für Feedback
    if (interaction.isStringSelectMenu() && interaction.customId === 'feedbackSelectSeller') {
      const selectedUserId = interaction.values[0];
      const member = await interaction.guild.members.fetch(selectedUserId);

      const modal = new ModalBuilder()
        .setCustomId(`feedbackModal_${selectedUserId}`)
        .setTitle(`Feedback für ${member.user.username}`);

      const sterneInput = new TextInputBuilder()
        .setCustomId('sterne')
        .setLabel('Bewertung (1-5 Sterne)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1-5')
        .setRequired(true);

      const textInput = new TextInputBuilder()
        .setCustomId('text')
        .setLabel('Kommentar')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Schreibe hier dein Feedback...')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(sterneInput),
        new ActionRowBuilder().addComponents(textInput)
      );

      await interaction.showModal(modal);
      return;
    }

    // Modal Submit Feedback
    if (interaction.isModalSubmit() && interaction.customId.startsWith('feedbackModal_')) {
      const verkaeuferId = interaction.customId.split('_')[1];
      const verkaeufer = await interaction.guild.members.fetch(verkaeuferId);

      let sterne = parseInt(interaction.fields.getTextInputValue('sterne'));
      if (isNaN(sterne) || sterne < 1) sterne = 1;
      if (sterne > 5) sterne = 5;

      const text = interaction.fields.getTextInputValue('text') || 'Kein Kommentar';

      const feedbackEmbed = new EmbedBuilder()
        .setTitle(`📝 Neues Feedback für ${verkaeufer.user.username}`)
        .setColor(0x00FF00)
        .addFields(
          { name: 'Bewertung', value: `${'⭐'.repeat(sterne)}`, inline: true },
          { name: 'Kommentar', value: text, inline: false },
          { name: 'Von', value: `${interaction.user}`, inline: true }
        )
        .setFooter({ text: 'Kandar Community' })
        .setTimestamp();

      const feedbackChannel = await interaction.guild.channels.fetch(process.env.FEEDBACK_CHANNEL_ID);

      if (feedbackChannel) {
        await feedbackChannel.send({ embeds: [feedbackEmbed] });
        await updateAverageStarsChannel(interaction.guild);
        await interaction.reply({ content: '✅ Dein Feedback wurde gesendet!', ephemeral: false });
      } else {
        await interaction.reply({ content: '⚠️ Feedback-Channel nicht gefunden!', ephemeral: true });
      }
    }

  } catch (error) {
    console.error('Fehler im Interaction Listener:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '❌ Es ist ein Fehler aufgetreten!', ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ Es ist ein Fehler aufgetreten!', ephemeral: true });
    }
  }
});

// === Willkommen-Embed ===
client.on('guildMemberAdd', async (member) => {
  try {
    const channel = await member.guild.channels.fetch(process.env.WELCOME_CHANNEL_ID);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle(`👋 Willkommen, ${member.user.username}!`)
      .setDescription(`Hey ${member}, willkommen auf **${member.guild.name}**!\nWir freuen uns, dass du da bist 🎉`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'Kandar Community' })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    // Serverstats aktualisieren
    createOrUpdateStatsChannels(member.guild);
  } catch (error) {
    console.error('Fehler beim Senden des Welcome-Embeds:', error);
  }
});

// === Bot Login ===
client.login(process.env.DISCORD_TOKEN);
