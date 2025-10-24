import {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder
} from 'discord.js';

const allowedRoles = process.env.ORDER_ROLES?.split(",") || []; // mehrere Rollen möglich
const orders = new Map(); // speichert Bestellungen pro User

export default {
    data: new SlashCommandBuilder()
        .setName('order')
        .setDescription('Erstelle und verwalte eine Bestellung')
        .addStringOption(option =>
            option
                .setName('artikel')
                .setDescription('Welchen Artikel möchtest du bestellen?')
                .setRequired(true)
        ),

    async execute(interaction) {
        const memberRoles = interaction.member.roles.cache.map(role => role.id);

        // ✅ Rollenprüfung
        if (!memberRoles.some(role => allowedRoles.includes(role))) {
            return interaction.reply({
                content: '❌ Du hast keine Berechtigung diesen Command zu benutzen!',
                ephemeral: true
            });
        }

        const item = interaction.options.getString('artikel');
        const userId = interaction.user.id;

        if (!orders.has(userId)) orders.set(userId, []);
        orders.get(userId).push(item);

        const embed = new EmbedBuilder()
            .setTitle('🛒 Bestellung Übersicht')
            .setDescription(
                orders.get(userId).map((i, index) => `**${index + 1}.** ${i}`).join('\n')
            )
            .setColor('#00A8FF')
            .setFooter({ text: 'Verwende das Menü unten um fortzufahren!' });

        const menu = new StringSelectMenuBuilder()
            .setCustomId('order-menu')
            .setPlaceholder('Was möchtest du tun?')
            .addOptions([
                {
                    label: 'Artikel hinzufügen',
                    description: 'Füge einen weiteren Artikel hinzu',
                    value: 'add-item'
                },
                {
                    label: 'Bestellung abschließen',
                    description: 'Beendet deine Bestellung',
                    value: 'finish-order'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(menu);

        await interaction.reply({ embeds: [embed], components: [row] });
    },

    async handleInteraction(interaction) {
        const userId = interaction.user.id;

        // ✅ Dropdown-Auswahl
        if (interaction.customId === 'order-menu') {
            const selection = interaction.values[0];

            if (selection === 'add-item') {
                const modal = new ModalBuilder()
                    .setCustomId('order-modal')
                    .setTitle('Artikel hinzufügen');

                const input = new TextInputBuilder()
                    .setCustomId('order-item')
                    .setLabel('Neuer Artikel')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder().addComponents(input);

                modal.addComponents(row);
                return interaction.showModal(modal);
            }

            if (selection === 'finish-order') {
                orders.delete(userId);

                const embed = new EmbedBuilder()
                    .setTitle('✅ Bestellung abgeschlossen')
                    .setDescription('Danke! Deine Bestellung wurde erfolgreich übermittelt ✅')
                    .setColor('#00FF6E');

                await interaction.update({ embeds: [embed], components: [] });
            }
        }

        // ✅ Modal nach Eingabe
        if (interaction.customId === 'order-modal') {
            const item = interaction.fields.getTextInputValue('order-item');

            if (!orders.has(userId)) orders.set(userId, []);
            orders.get(userId).push(item);

            const embed = new EmbedBuilder()
                .setTitle('🛒 Bestellung Übersicht')
                .setDescription(
                    orders.get(userId).map((i, index) => `**${index + 1}.** ${i}`).join('\n')
                )
                .setColor('#00A8FF');

            const menu = new StringSelectMenuBuilder()
                .setCustomId('order-menu')
                .addOptions(
                    {
                        label: 'Artikel hinzufügen',
                        value: 'add-item'
                    },
                    {
                        label: 'Bestellung abschließen',
                        value: 'finish-order'
                    }
                );

            const row = new ActionRowBuilder().addComponents(menu);

            await interaction.reply({ embeds: [embed], components: [row] });
        }
    }
};

