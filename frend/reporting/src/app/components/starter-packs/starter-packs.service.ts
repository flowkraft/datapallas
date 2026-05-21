import { Injectable } from '@angular/core';

/**
 * Defines the static properties of a starter pack.
 * Dynamic status and user customizations are fetched separately.
 * Renamed defaultStartCmd/defaultStopCmd to startCmd/stopCmd.
 */
export interface StarterPackDefinition {
  id: string; // Unique identifier, must match the ID used by the backend API
  family: string; // e.g., 'database', 'messaging', 'integration' - Must match CLI family
  packName: string; // e.g., 'northwind', 'rabbitmq' - Must match CLI pack_name
  target?: string; // Optional target system/environment if applicable (e.g., the vendor for northwind)
  displayName: string; // User-friendly name shown in the UI
  description: string; // Brief description
  icon?: string; // Optional icon key (e.g., 'postgresql', 'mysql') matching iconMap in component
  startCmd: string; // The command string expected by StarterPackCLI.java (including port if applicable)
  stopCmd: string; // The command string expected by StarterPackCLI.java
  tags?: string[]; // Keywords for filtering/categorization
}

@Injectable({
  providedIn: 'root',
})
export class StarterPacksService {
  // --- Static Definitions ---
  // These definitions provide the static metadata for starter packs.
  // The 'id' must uniquely identify the pack instance and match the ID used by the backend API.
  // The 'icon' property should now contain the simple string key matching the iconMap in starter-packs.component.ts
  // startCmd/stopCmd MUST match the format expected by the backend CLI, including ports for start commands.
  private starterPackDefinitions: StarterPackDefinition[] = [
    // --- Database Family: Northwind Pack ---
    {
      id: 'db-northwind-oracle',
      family: 'database',
      packName: 'northwind',
      target: 'oracle',
      displayName: 'Northwind DB (Oracle)',
      description: 'Sample Oracle database.',
      icon: 'oracle', // Use simple key matching iconMap
      startCmd: 'system service database start northwind oracle 1521', // Start command with port
      stopCmd: 'system service database stop northwind oracle', // Stop command
      tags: ['database', 'northwind', 'oracle'],
    },
    {
      id: 'db-northwind-sqlserver',
      family: 'database',
      packName: 'northwind',
      target: 'sqlserver',
      displayName: 'Northwind DB (SQL Server)',
      description: 'Sample SQL Server database.',
      icon: 'sqlserver', // Use simple key matching iconMap
      startCmd: 'system service database start northwind sqlserver 1433', // Start command with port
      stopCmd: 'system service database stop northwind sqlserver', // Stop command
      tags: ['database', 'northwind', 'sqlserver'],
    },
    {
      id: 'db-northwind-db2',
      family: 'database',
      packName: 'northwind',
      target: 'db2', // Matches Java enum DB2 and docker-compose service name
      displayName: 'Northwind DB (IBM Db2)',
      description: 'Sample IBM Db2 database.',
      icon: 'db2', // Use simple key matching iconMap
      startCmd: 'system service database start northwind db2 50000', // Start command with port
      stopCmd: 'system service database stop northwind db2', // Stop command
      tags: ['database', 'northwind', 'ibmdb2'],
    },
    {
      id: 'db-northwind-postgres', // Unique ID for this specific instance
      family: 'database', // Matches CLI family
      packName: 'northwind', // Matches CLI pack_name
      target: 'postgres', // Specific vendor/target
      displayName: 'Northwind DB (PostgreSQL)',
      description: 'Sample PostgreSQL database.',
      icon: 'postgresql', // Use simple key matching iconMap
      startCmd: 'system service database start northwind postgres 5432', // Start command with port
      stopCmd: 'system service database stop northwind postgres', // Stop command
      tags: ['database', 'northwind', 'postgres'],
    },
    {
      id: 'db-northwind-mysql',
      family: 'database',
      packName: 'northwind',
      target: 'mysql',
      displayName: 'Northwind DB (MySQL)',
      description: 'Sample MySQL database.',
      icon: 'mysql', // Use simple key matching iconMap
      startCmd: 'system service database start northwind mysql 3306', // Start command with port
      stopCmd: 'system service database stop northwind mysql', // Stop command
      tags: ['database', 'northwind', 'mysql'],
    },
    {
      id: 'db-northwind-mariadb',
      family: 'database',
      packName: 'northwind',
      target: 'mariadb',
      displayName: 'Northwind DB (MariaDB)',
      description: 'Sample MariaDB database.',
      icon: 'mariadb', // Use simple key matching iconMap
      startCmd: 'system service database start northwind mariadb 3307', // Start command with port
      stopCmd: 'system service database stop northwind mariadb', // Stop command
      tags: ['database', 'northwind', 'mariadb'],
    },
    {
      id: 'db-northwind-clickhouse',
      family: 'database',
      packName: 'northwind',
      target: 'clickhouse',
      displayName: 'Northwind DB (ClickHouse)',
      description: 'Sample ClickHouse OLAP database for analytics.',
      icon: 'clickhouse', // Use simple key matching iconMap
      startCmd: 'system service database start northwind clickhouse 8123', // Start command with port
      stopCmd: 'system service database stop northwind clickhouse', // Stop command
      tags: ['database', 'northwind', 'clickhouse', 'olap', 'analytics'],
    },
    {
      id: 'db-northwind-supabase',
      family: 'database',
      packName: 'northwind',
      target: 'supabase',
      displayName: 'Northwind DB (Supabase)',
      description: 'Supabase is the Postgres development platform. Start your project with a Postgres database, Authentication, instant APIs, Edge Functions, Realtime subscriptions, Storage, and Vector embeddings.',
      icon: 'supabase',
      startCmd: 'system service database start northwind supabase 5435',
      stopCmd: 'system service database stop northwind supabase',
      tags: ['database', 'northwind', 'supabase', 'postgres', 'baas', ' backend-as-a-service', 'auth', 'real-time', 'storage', 'vector-embeddings'],
    },
    {
      id: 'db-redis',
      family: 'database',
      packName: 'cache',
      target: 'redis',
      displayName: 'Redis',
      description: 'Your Dashboards Are About to Get Faster.',
      icon: 'redis',
      startCmd: 'system service database start cache redis 6379',
      stopCmd: 'system service database stop cache redis',
      tags: ['database', 'redis', 'cache', 'in-memory', 'key-value', 'real-time', 'performance'],
    },
    {
      id: 'db-timeseries-timescaledb',
      family: 'database',
      packName: 'timeseries',
      target: 'timescaledb',
      displayName: 'TimescaleDB',
      description: 'PostgreSQL extended for time-series workloads. Hypertables, continuous aggregates, time-bucketed queries.',
      icon: 'timescaledb',
      startCmd: 'system service database start timeseries timescaledb 5433',
      stopCmd: 'system service database stop timeseries timescaledb',
      tags: ['database', 'timescaledb', 'postgres', 'time-series', 'hypertable', 'analytics'],
    },
    // --- Add other families/packs here as needed ---
    // Example for a hypothetical 'messaging' family:
    // {
    //   id: 'messaging-rabbitmq-main',
    //   family: 'messaging',
    //   packName: 'rabbitmq',
    //   target: 'main-cluster',
    //   displayName: 'RabbitMQ Cluster',
    //   description: 'Starts/stops the main RabbitMQ message broker cluster.',
    //   icon: 'rabbitmq', // Hypothetical simple key
    //   startCmd: 'messaging start rabbitmq main-cluster 5672', // Hypothetical start command with port
    //   stopCmd: 'messaging stop rabbitmq main-cluster', // Hypothetical stop command
    //   tags: ['messaging', 'amqp', 'rabbitmq', 'queue', 'docker', 'cluster'],
    // },
  ];

  constructor() {}

  /**
   * Returns the array of static starter pack definitions.
   */
  getStarterPackDefinitions(): StarterPackDefinition[] {
    // Return a copy to prevent external modification
    return [...this.starterPackDefinitions];
  }

  /**
   * Finds a specific starter pack definition by its ID.
   * @param id The ID of the starter pack definition to find.
   * @returns The StarterPackDefinition or undefined if not found.
   */
  findDefinitionById(id: string): StarterPackDefinition | undefined {
    return this.starterPackDefinitions.find((def) => def.id === id);
  }
}
