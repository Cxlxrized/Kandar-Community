import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import 'dotenv/config';

export default function order(client) {

  const allowedRoles = process.env.ORDER_ROLES ? process.env.ORDER_ROLES.split(',') : [];

  function hasPermission(member) {
    if (allowedRoles.length === 0) return true;
    return member.roles.cache.some(role => allowedRoles.includes(role.id));
  }

  client.on("interactionCreate", async (interaction) => {

    // ✅ Slash Command Abfrage
    if (interaction.isChatInputCommand() && interaction.commandName === "bestellung") {

      if (!hasPermission(interaction.member)) {
        return interaction.reply({ content: "❌ Du hast keine Berechtigung, eine Bestellung zu erstellen!", ephemeral: true });
      }

      const artikel = interaction.options.getString("artikel");

      const embed = new EmbedBuilder()
        .setTitle("🛒 Bestellübersicht")
        .setDescription(`📦 Artikel:\n- ${artikel}`)
        .setColor("#00aaff");

      const menu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("order_menu")
          .setPlaceholder("Aktion auswählen …")
          .addOptions([
            { label: "Artikel hinzufügen ➕", value: "add" },
            { label: "Bestellung abschließen ✅", value: "finish" }
          ])
      );

      return interaction.reply({ embeds: [embed], components: [menu] });
    }

    // ✅ Menu handler
    if (interaction.isStringSelectMenu() && interaction.customId === "order_menu") {

      if (!hasPermission(interaction.member)) {
        return interaction.reply({ content: "❌ Du darfst diese Bestellung nicht bearbeiten!", ephemeral: true });
      }

      const action = interaction.values[0];

      if (action === "add") {
        const modal = new ModalBuilder()
          .setCustomId("order_add_modal")
          .setTitle("Artikel hinzufügen");

        const text = new TextInputBuilder()
          .setCustomId("order_text")
          .setLabel("Welcher Artikel?")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(text));
        return interaction.showModal(modal);
      }

      if (action === "finish") {
        const embed = new EmbedBuilder()
          .setTitle("✅ Bestellung abgeschlossen")
          .setDescription(`Vielen Dank für deine Bestellung!`)
          .setColor("Green");

        await interaction.message.delete().catch(() => {});
        return interaction.reply({ embeds: [embed] });
      }
    }

    // ✅ Modal handler
    if (interaction.isModalSubmit() && interaction.customId === "order_add_modal") {

      if (!hasPermission(interaction.member)) {
        return interaction.reply({ content: "❌ Keine Berechtigung!", ephemeral: true });
      }

      const text = interaction.fields.getTextInputValue("order_text");
      const message = await interaction.channel.messages.fetch(interaction.message.id);
      const oldEmbed = message.embeds[0];

      const newEmbed = EmbedBuilder.from(oldEmbed)
        .setDescription(oldEmbed.description + `\n- ${text}`);

      return interaction.update({ embeds: [newEmbed] });
    }
  });
}
