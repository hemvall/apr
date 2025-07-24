# API Orderly Trading

Cette API permet d'interagir avec Orderly Network pour passer des ordres de trading avec TP/SL automatiques.

## Installation

```bash
# Installer les dépendances
yarn install
```

## Configuration

Créez un fichier `.env` avec :
```
PRIVATE_KEY=votre_clé_privée
ORDERLY_SECRET=votre_clé_orderly (sera générée automatiquement si absente)
PORT=3000
```

## Démarrage

### Option 1 : Développement
```bash
# API avec hot-reload
yarn api:dev
```

### Option 2 : Production avec PM2 (recommandé)
```bash
# Rendre le script exécutable
chmod +x start-pm2.sh

# Démarrer avec PM2
./start-pm2.sh
```

### Option 3 : Production avec Docker
```bash
# Construire et démarrer
docker-compose up -d

# Voir les logs
docker-compose logs -f
```

### Option 4 : Service systemd (Linux/Mac)
```bash
# Copier le service
sudo cp orderly-api.service /etc/systemd/system/

# Recharger systemd
sudo systemctl daemon-reload

# Démarrer le service
sudo systemctl start orderly-api

# Activer au démarrage
sudo systemctl enable orderly-api
```

## Endpoints API

### GET /health
Vérifier que l'API fonctionne

### GET /account
Récupérer les informations du compte

### GET /market/:symbol
Obtenir le prix actuel du marché
- Paramètre : `symbol` (défaut: PERP_ETH_USDC)

### POST /order
Créer un ordre avec TP/SL automatique basé sur les cibles de PnL
```json
{
  "symbol": "PERP_ETH_USDC",  // optionnel
  "quantity": 0.005,           // taille de l'ordre (optionnel)
  "tpPnL": 3,                  // profit cible en $ (optionnel, défaut: 3)
  "slPnL": -3,                 // perte max en $ (optionnel, défaut: -3)
  "side": "BUY"                // BUY ou SELL (optionnel, défaut: BUY)
}
```

### GET /orders
Récupérer tous les ordres ouverts

### DELETE /order/:orderId
Annuler un ordre
```json
{
  "symbol": "PERP_ETH_USDC",  // optionnel
  "isAlgo": false             // true pour les ordres algo (TP/SL)
}
```

## Utilisation avec curl

```bash
# Vérifier l'API
curl http://localhost:3000/health

# Obtenir le prix du marché
curl http://localhost:3000/market/PERP_ETH_USDC

# Créer un ordre d'achat avec TP/SL basé sur PnL
curl -X POST http://localhost:3000/order \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 0.01,
    "tpPnL": 5,
    "slPnL": -2
  }'

# Créer un ordre de vente
curl -X POST http://localhost:3000/order \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 0.01,
    "side": "SELL",
    "tpPnL": 5,
    "slPnL": -2
  }'

# Voir les ordres ouverts
curl http://localhost:3000/orders
```

## Frontend

Vous pouvez créer un frontend React/Vue/Angular qui appelle ces endpoints.
L'API supporte CORS donc peut être appelée depuis n'importe quel domaine.

## Monitoring

### Avec PM2
```bash
pm2 status        # Statut
pm2 logs         # Logs en temps réel
pm2 monit        # Dashboard
```

### Avec Docker
```bash
docker-compose logs -f    # Logs
docker stats             # Ressources
```

### Avec systemd
```bash
sudo systemctl status orderly-api   # Statut
sudo journalctl -u orderly-api -f  # Logs
```
