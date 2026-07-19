#!/bin/sh
set -e

echo "Aguardar Postgres..."
until pg_isready -h "${POSTGRES_HOST:-postgres}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-sar_app}" ; do
  sleep 2
done

echo "Executar migrations..."
npm run db:migrate

echo "Importar CSV oficial..."
npm run db:import-csv

echo "Arrancar backend..."
npm start