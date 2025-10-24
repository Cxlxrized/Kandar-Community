import { REST, Routes, SlashCommandBuilder } from "discord.js";
import "dotenv/config";

export default async function registerCommands(client) {

  const commands = [

    // === PayPal ===
    new SlashCommandBuilder()
      .setName("paypal")
      .setDescription("💰 PayPal Zahlung erstellen")
      .addNumberOption(option =>
        option.setName("betrag")
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
          .addStringOption(o => o.setName("dauer").setDescription("d = Tage, h = Stunden, m = Minuten (z.B. 1h)").setRequired(true))
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
      .addStringOption(option =>
        option.setName("artikel")
          .setDescription("Artikel den du bestellst")
          .setRequired(true)
      )
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("🔁 Lade Slash Commands ...");
    await rest.put(
      Routes.applicationCommands(
        client.user?.id ?? process.env.CLIENT_ID
      ),
      { body: commands }
    );
    console.log("✅ Alle Slash Commands erfolgreich geladen!");
  } catch (error) {
    console.error("❌ Command Fehler:", error);
  }
}
