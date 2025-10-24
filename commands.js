import { REST, Routes, SlashCommandBuilder } from "discord.js";
import "dotenv/config";

export default async function registerCommands(client) {
  const commands = [
    // === PayPal ===
    new SlashCommandBuilder()
      .setName("paypal")
      .setDescription("💰 PayPal Zahlung erstellen")
      .addNumberOption(opt =>
        opt.setName("betrag")
          .setDescription("Betrag in €")
          .setRequired(true)
      ),

    // === Ticket Embed erstellen ===
    new SlashCommandBuilder()
      .setName("ticketmsg")
      .setDescription("🎫 Ticket Nachricht senden (Admin)"),

    // === Finish / Kundenfeedback ===
    new SlashCommandBuilder()
      .setName("finish")
      .setDescription("✅ Bestellung abschließen & Feedback abfragen"),

    // === Verify Nachricht ===
    new SlashCommandBuilder()
      .setName("verify")
      .setDescription("✅ Verify Embed senden"),

    // === Giveaway Commands ===
    new SlashCommandBuilder()
      .setName("giveaway")
      .setDescription("🎉 Giveaway verwalten")
      .addSubcommand(sub =>
        sub.setName("start")
          .setDescription("🎉 Neues Giveaway starten")
          .addStringOption(o => o.setName("dauer").setDescription("d = Tage, h = Stunden, m = Minuten").setRequired(true))
          .addStringOption(o => o.setName("preis").setDescription("Gewinn").setRequired(true))
          .addChannelOption(o => o.setName("kanal").setDescription("Kanal für das Giveaway").setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName("delete")
          .setDescription("🗑️ Giveaway löschen")
          .addStringOption(o => o.setName("id").setDescription("Giveaway Message ID").setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName("reroll")
          .setDescription("🎲 Gewinner neu auslosen")
          .addStringOption(o => o.setName("id").setDescription("Giveaway Message ID").setRequired(true))
      ),

    // === Bestellung System ===
    new SlashCommandBuilder()
      .setName("bestellung")
      .setDescription("🛒 Bestellung anlegen & verwalten")
      .addStringOption(opt =>
        opt.setName("artikel")
          .setDescription("Artikel den du bestellst")
          .setRequired(true)
      )
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("🔁 Lade Slash Commands ...");

    // === Guild oder Global? ===
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log("✅ Guild Commands erfolgreich geladen!");
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log("✅ Global Commands erfolgreich geladen!");
    }

  } catch (err) {
    console.error("❌ Fehler beim Registrieren der Commands:", err);
  }
}

