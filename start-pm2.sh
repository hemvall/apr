#!/bin/bash

# Script pour démarrer l'API avec PM2

# Installer PM2 globalement si pas déjà installé
if ! command -v pm2 &> /dev/null; then
    echo "Installation de PM2..."
    npm install -g pm2
fi

# Arrêter l'instance existante si elle existe
pm2 stop orderly-api 2>/dev/null

# Démarrer l'API
pm2 start src/api.ts --name orderly-api --interpreter tsx

# Sauvegarder la configuration PM2
pm2 save

# Configurer PM2 pour démarrer au boot
pm2 startup

echo "API démarrée avec PM2!"
echo "Commandes utiles:"
echo "  pm2 status        - Voir le statut"
echo "  pm2 logs          - Voir les logs"
echo "  pm2 restart orderly-api - Redémarrer l'API"
echo "  pm2 stop orderly-api    - Arrêter l'API"
