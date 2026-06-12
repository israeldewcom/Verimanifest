import prisma from '../config/database';
import { environment } from '../config/environment';
import logger from '../config/logger';

class DataWarehouse {
  private bigquery: any = null;
  private snowflake: any = null;

  constructor() {
    if (environment.WAREHOUSE_TYPE === 'bigquery' && environment.BIGQUERY_PROJECT_ID) {
      const { BigQuery } = require('@google-cloud/bigquery');
      this.bigquery = new BigQuery({
        projectId: environment.BIGQUERY_PROJECT_ID,
        credentials: {
          client_email: environment.BIGQUERY_CLIENT_EMAIL,
          private_key: environment.BIGQUERY_PRIVATE_KEY,
        },
      });
      logger.info('BigQuery initialized');
    } else if (environment.WAREHOUSE_TYPE === 'snowflake' && environment.SNOWFLAKE_ACCOUNT) {
      const snowflake = require('snowflake-sdk');
      this.snowflake = snowflake.createConnection({
        account: environment.SNOWFLAKE_ACCOUNT,
        warehouse: environment.SNOWFLAKE_WAREHOUSE,
        database: environment.SNOWFLAKE_DATABASE,
        schema: environment.SNOWFLAKE_SCHEMA,
        username: environment.SNOWFLAKE_USER,
        password: environment.SNOWFLAKE_PASSWORD,
      });
      this.snowflake.connect((err: any) => {
        if (err) logger.error('Snowflake connection error', { error: err });
        else logger.info('Snowflake connected');
      });
    } else {
      logger.warn('No data warehouse configured');
    }
  }

  async syncToWarehouse() {
    if (!this.bigquery && !this.snowflake) {
      logger.warn('Data warehouse not configured, skipping sync');
      return [];
    }

    const tables = [
      { name: 'User', query: prisma.user.findMany },
      { name: 'Company', query: prisma.company.findMany },
      { name: 'Manifest', query: prisma.manifest.findMany },
      { name: 'Signature', query: prisma.signature.findMany },
      { name: 'ComplianceCheck', query: prisma.complianceCheck.findMany },
    ];
    const results: any[] = [];

    for (const table of tables) {
      try {
        const data = await table.query();
        if (data.length === 0) continue;

        if (this.bigquery) {
          const dataset = this.bigquery.dataset(environment.BIGQUERY_DATASET);
          const tableObj = dataset.table(table.name.toLowerCase());
          await tableObj.insert(data);
        } else if (this.snowflake) {
          // Use parameterized queries or batch insert with Snowflake's built-in JSON
          for (const row of data) {
            const sql = `INSERT INTO ${table.name.toLowerCase()} (${Object.keys(row).join(',')}) VALUES (?)`;
            // Use Snowflake's bind parameters to avoid injection
            await new Promise((resolve, reject) => {
              this.snowflake.execute({
                sqlText: sql,
                binds: [Object.values(row)],
              }, (err: any) => {
                if (err) reject(err);
                else resolve(null);
              });
            });
          }
        }

        await prisma.dataSyncLog.create({
          data: {
            table: table.name,
            recordCount: data.length,
            syncedAt: new Date(),
          },
        });

        results.push({ table: table.name, count: data.length, success: true });
        logger.info(`Synced ${data.length} records to warehouse for ${table.name}`);
      } catch (error: any) {
        logger.error(`Data warehouse sync failed for ${table.name}`, { error });
        results.push({ table: table.name, success: false, error: error.message });
      }
    }

    return results;
  }

  async getSyncHistory() {
    return prisma.dataSyncLog.findMany({
      orderBy: { syncedAt: 'desc' },
      take: 100,
    });
  }
}

export const dataWarehouse = new DataWarehouse();
