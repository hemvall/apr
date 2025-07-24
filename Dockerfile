# Utiliser l'image Node.js officielle
FROM node:20-alpine

# Créer le répertoire de travail
WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json yarn.lock ./

# Installer les dépendances
RUN yarn install --frozen-lockfile

# Copier le reste du code
COPY . .

# Exposer le port de l'API
EXPOSE 3000

# Démarrer l'API
CMD ["yarn", "api:prod"]
