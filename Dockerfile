# === Basisimage mit Node 22 ===
FROM node:22-slim

# === Arbeitsverzeichnis erstellen ===
WORKDIR /app

# === Pakete kopieren und installieren ===
COPY package*.json ./
RUN npm install --omit=dev

# === Restlichen Code kopieren ===
COPY . .

# === ENV-Variablen aktivieren ===
ENV NODE_ENV=production

# === Startbefehl ===
CMD ["npm", "start"]