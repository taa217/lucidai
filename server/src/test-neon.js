const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_iCl2zA4bMgvk@ep-rapid-fog-a2o3j1b6-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});
client.connect()
  .then(() => console.log('Connected!'))
  .catch(err => console.error('Connection error:', err))
  .finally(() => client.end());
