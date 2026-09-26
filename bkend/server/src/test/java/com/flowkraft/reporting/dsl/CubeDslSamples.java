package com.flowkraft.reporting.dsl;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The cube DSLs the tests are written against, in one place.
 *
 * <p>They were the parser test's own DSLs, and they still are — {@code CubeOptionsParserTest} reads
 * them from here and keeps every assertion it had. They live here because the generator's drift
 * guard runs over the same DSLs: every cube in every one of them, every dimension alone and every
 * measure alone, must generate SQL that reaches the database whole. A DSL feature taught to the
 * parser alone then fails a test instead of reaching a user as a broken query.
 */
public final class CubeDslSamples {

	private CubeDslSamples() {
	}

	public static final String CRM_CUSTOMER_LIST =
			"cube {\n" +
			"  sql_table 'public.customers'\n" +
			"  title 'Customers'\n" +
			"  description 'All registered customers'\n" +
			"\n" +
			"  dimension { name 'customer_id'; sql 'id'; type 'number'; primary_key true }\n" +
			"  dimension { name 'name'; sql 'name'; type 'string' }\n" +
			"  dimension { name 'country'; sql 'country'; type 'string'; order 'asc' }\n" +
			"\n" +
			"  measure { name 'count'; type 'count' }\n" +
			"}";

	public static final String ECOMMERCE_REVENUE_DASHBOARD =
			"cube {\n" +
			"  sql_table 'public.orders'\n" +
			"  title 'Orders'\n" +
			"  meta icon: 'shopping-cart', category: 'sales'\n" +
			"\n" +
			"  dimension { name 'order_id'; sql 'id'; type 'number'; primary_key true }\n" +
			"  dimension { name 'status'; sql 'status'; type 'string' }\n" +
			"  dimension { name 'created_at'; sql 'created_at'; type 'time'; order 'desc' }\n" +
			"\n" +
			"  measure {\n" +
			"    name 'total_orders'; type 'count'\n" +
			"    drill_members 'order_id', 'status', 'created_at'\n" +
			"  }\n" +
			"  measure { name 'revenue'; sql 'amount'; type 'sum'; format 'currency' }\n" +
			"  measure { name 'avg_order_value'; sql 'amount'; type 'avg'; format 'currency' }\n" +
			"}";

	public static final String COMPLETED_ORDERS_FILTERED_KPIS =
			"cube {\n" +
			"  sql 'SELECT * FROM orders WHERE created_at >= \\'2024-01-01\\''\n" +
			"  title 'Orders 2024+'\n" +
			"\n" +
			"  dimension { name 'order_id'; sql 'id'; type 'number'; primary_key true }\n" +
			"  dimension { name 'status'; sql 'status'; type 'string' }\n" +
			"  dimension { name 'created_at'; sql 'created_at'; type 'time' }\n" +
			"\n" +
			"  measure { name 'total_orders'; type 'count' }\n" +
			"  measure {\n" +
			"    name 'completed_count'\n" +
			"    type 'count'\n" +
			"    sql 'id'\n" +
			"    filters {\n" +
			"      filter sql: \"${CUBE}.status = 'completed'\"\n" +
			"    }\n" +
			"  }\n" +
			"  measure {\n" +
			"    name 'high_value_revenue'\n" +
			"    type 'sum'\n" +
			"    sql 'amount'\n" +
			"    format 'currency'\n" +
			"    filters {\n" +
			"      filter sql: '${CUBE}.amount > 500'\n" +
			"    }\n" +
			"  }\n" +
			"}";

	public static final String CUSTOMER360_WITH_ORDER_STATS =
			"cube {\n" +
			"  sql_table 'public.customers'\n" +
			"  title 'Customer 360'\n" +
			"  description 'Customer profiles with order history'\n" +
			"\n" +
			"  dimension { name 'customer_id'; sql 'id'; type 'number'; primary_key true }\n" +
			"  dimension { name 'name'; sql 'name'; type 'string' }\n" +
			"  dimension { name 'email'; sql 'email'; type 'string' }\n" +
			"  dimension { name 'signed_up_at'; sql 'created_at'; type 'time' }\n" +
			"  dimension {\n" +
			"    name 'order_count'\n" +
			"    sql '${orders.count}'\n" +
			"    type 'number'\n" +
			"    sub_query true\n" +
			"    description 'Total orders placed by this customer'\n" +
			"  }\n" +
			"\n" +
			"  measure { name 'count'; type 'count' }\n" +
			"\n" +
			"  join {\n" +
			"    name 'orders'\n" +
			"    sql '${CUBE}.id = orders.customer_id'\n" +
			"    relationship 'one_to_many'\n" +
			"  }\n" +
			"}";

	public static final String PRODUCT_SALES_STAR_SCHEMA =
			"cube {\n" +
			"  sql_table 'public.order_items'\n" +
			"  title 'Product Sales'\n" +
			"\n" +
			"  dimension { name 'id'; sql 'id'; type 'number'; primary_key true }\n" +
			"\n" +
			"  measure {\n" +
			"    name 'items_sold'; type 'count'\n" +
			"    drill_members 'id'\n" +
			"  }\n" +
			"  measure { name 'revenue'; sql 'quantity * unit_price'; type 'sum'; format 'currency' }\n" +
			"  measure { name 'unique_products'; sql 'product_id'; type 'count_distinct' }\n" +
			"  measure { name 'avg_unit_price'; sql 'unit_price'; type 'avg' }\n" +
			"  measure { name 'cheapest_item'; sql 'unit_price'; type 'min' }\n" +
			"  measure { name 'most_expensive'; sql 'unit_price'; type 'max' }\n" +
			"\n" +
			"  join {\n" +
			"    name 'orders'\n" +
			"    sql '${CUBE}.order_id = orders.id'\n" +
			"    relationship 'many_to_one'\n" +
			"  }\n" +
			"  join {\n" +
			"    name 'products'\n" +
			"    sql '${CUBE}.product_id = products.id'\n" +
			"    relationship 'many_to_one'\n" +
			"  }\n" +
			"}";

	public static final String CLOTHING_STORE_SIZE_LABELS =
			"cube {\n" +
			"  sql_table 'retail.products'\n" +
			"  title 'Product Catalog'\n" +
			"\n" +
			"  dimension { name 'product_id'; sql 'id'; type 'number'; primary_key true }\n" +
			"  dimension { name 'name'; sql 'name'; type 'string' }\n" +
			"  dimension {\n" +
			"    name 'size_label'\n" +
			"    type 'string'\n" +
			"    case_ {\n" +
			"      when sql: \"${CUBE}.size_code = 'xs'\", label: 'Extra Small'\n" +
			"      when sql: \"${CUBE}.size_code = 'sm'\", label: 'Small'\n" +
			"      when sql: \"${CUBE}.size_code = 'md'\", label: 'Medium'\n" +
			"      when sql: \"${CUBE}.size_code = 'lg'\", label: 'Large'\n" +
			"      when sql: \"${CUBE}.size_code = 'xl'\", label: 'Extra Large'\n" +
			"      else_ label: 'Unknown'\n" +
			"    }\n" +
			"  }\n" +
			"  dimension {\n" +
			"    name 'price_tier'\n" +
			"    type 'string'\n" +
			"    case_ {\n" +
			"      when sql: '${CUBE}.price < 25', label: 'Budget'\n" +
			"      when sql: '${CUBE}.price < 100', label: 'Mid-Range'\n" +
			"      when sql: '${CUBE}.price >= 100', label: 'Premium'\n" +
			"    }\n" +
			"  }\n" +
			"\n" +
			"  measure { name 'product_count'; type 'count' }\n" +
			"  measure { name 'avg_price'; sql 'price'; type 'avg'; format 'currency' }\n" +
			"}";

	public static final String DELIVERY_FLEET_TRACKER =
			"cube {\n" +
			"  sql_table 'logistics.deliveries'\n" +
			"  title 'Delivery Fleet'\n" +
			"\n" +
			"  dimension { name 'delivery_id'; sql 'id'; type 'number'; primary_key true }\n" +
			"  dimension { name 'driver_name'; sql 'driver'; type 'string' }\n" +
			"  dimension { name 'status'; sql 'status'; type 'string' }\n" +
			"  dimension {\n" +
			"    name 'current_location'\n" +
			"    type 'geo'\n" +
			"    latitude { sql '${CUBE}.lat' }\n" +
			"    longitude { sql '${CUBE}.lng' }\n" +
			"  }\n" +
			"  dimension {\n" +
			"    name 'destination'\n" +
			"    type 'geo'\n" +
			"    latitude { sql '${CUBE}.dest_lat' }\n" +
			"    longitude { sql '${CUBE}.dest_lng' }\n" +
			"  }\n" +
			"\n" +
			"  measure { name 'active_deliveries'; type 'count' }\n" +
			"}";

	public static final String RETAIL_CHAIN_STORE_LOCATOR =
			"cube {\n" +
			"  sql_table 'public.stores'\n" +
			"  title 'Store Directory'\n" +
			"\n" +
			"  dimension { name 'store_id'; sql 'id'; type 'number'; primary_key true }\n" +
			"  dimension { name 'store_name'; sql 'name'; type 'string' }\n" +
			"  dimension { name 'country'; sql 'country'; type 'string' }\n" +
			"  dimension { name 'region'; sql 'region'; type 'string' }\n" +
			"  dimension { name 'city'; sql 'city'; type 'string' }\n" +
			"  dimension {\n" +
			"    name 'opened_at'; sql 'opened_at'; type 'time'\n" +
			"    title 'Opening Date'\n" +
			"    description 'Date the store first opened'\n" +
			"  }\n" +
			"\n" +
			"  measure { name 'store_count'; type 'count' }\n" +
			"\n" +
			"  segment {\n" +
			"    name 'new_stores'\n" +
			"    sql \"${CUBE}.opened_at >= CURRENT_DATE - INTERVAL '1 year'\"\n" +
			"    description 'Opened within the last year'\n" +
			"  }\n" +
			"\n" +
			"  hierarchy {\n" +
			"    name 'geography'\n" +
			"    title 'Location'\n" +
			"    levels 'country', 'region', 'city'\n" +
			"  }\n" +
			"}";

	public static final String FINANCE_INTERNAL_STAGING_CUBE =
			"cube {\n" +
			"  sql_table 'finance.staging_quarterly_reconciliation_transactions_v2'\n" +
			"  sql_alias 'fin_recon'\n" +
			"  title 'Reconciliation (staging)'\n" +
			"  public_ false\n" +
			"\n" +
			"  dimension { name 'txn_id'; sql 'id'; type 'number'; primary_key true }\n" +
			"  dimension { name 'account'; sql 'gl_account'; type 'string' }\n" +
			"  dimension { name 'posted_at'; sql 'posted_at'; type 'time' }\n" +
			"\n" +
			"  measure { name 'count'; type 'count' }\n" +
			"  measure { name 'net_amount'; sql 'debit - credit'; type 'sum'; format 'currency' }\n" +
			"}";

	public static final String REGIONAL_ORDERS_EXTENDS =
			"cube('base_orders') {\n" +
			"  sql_table 'public.orders'\n" +
			"  dimension { name 'order_id'; sql 'id'; type 'number'; primary_key true }\n" +
			"  dimension { name 'status'; sql 'status'; type 'string' }\n" +
			"  dimension { name 'created_at'; sql 'created_at'; type 'time' }\n" +
			"  measure { name 'count'; type 'count' }\n" +
			"  measure { name 'revenue'; sql 'amount'; type 'sum'; format 'currency' }\n" +
			"}\n" +
			"cube('orders_us') {\n" +
			"  extends_ 'base_orders'\n" +
			"  sql_table 'public.orders_us'\n" +
			"  dimension { name 'us_state'; sql 'state'; type 'string' }\n" +
			"}\n" +
			"cube('orders_eu') {\n" +
			"  extends_ 'base_orders'\n" +
			"  sql_table 'public.orders_eu'\n" +
			"  dimension { name 'eu_country'; sql 'country'; type 'string' }\n" +
			"}";

	public static final String MULTI_DEPARTMENT_DASHBOARD =
			"cube('hr_headcount') {\n" +
			"  sql_table 'hr.employees'\n" +
			"  title 'Headcount'\n" +
			"  dimension { name 'emp_id'; sql 'id'; type 'number'; primary_key true }\n" +
			"  dimension { name 'department'; sql 'department'; type 'string' }\n" +
			"  dimension { name 'hire_date'; sql 'hire_date'; type 'time' }\n" +
			"  measure { name 'headcount'; type 'count' }\n" +
			"}\n" +
			"cube('sales_revenue') {\n" +
			"  sql_table 'sales.orders'\n" +
			"  title 'Revenue'\n" +
			"  dimension { name 'order_id'; sql 'id'; type 'number'; primary_key true }\n" +
			"  dimension { name 'region'; sql 'region'; type 'string' }\n" +
			"  measure { name 'total_orders'; type 'count' }\n" +
			"  measure { name 'revenue'; sql 'amount'; type 'sum'; format 'currency' }\n" +
			"}";

	public static final String SALES_PIPELINE_FULL_MODEL =
			"cube {\n" +
			"  sql_table 'public.sales'\n" +
			"  sql_alias 'sales'\n" +
			"  title 'Sales Transactions'\n" +
			"  description 'Point-of-sale transactions across all channels'\n" +
			"  public_ true\n" +
			"  meta icon: 'dollar-sign', color: '#28a745', priority: 1\n" +
			"\n" +
			"  // Primary key\n" +
			"  dimension { name 'sale_id'; sql 'id'; type 'number'; primary_key true }\n" +
			"\n" +
			"  // Categorical\n" +
			"  dimension { name 'channel'; sql 'sales_channel'; type 'string'; title 'Sales Channel' }\n" +
			"  dimension { name 'country'; sql 'country'; type 'string' }\n" +
			"  dimension { name 'region'; sql 'region'; type 'string' }\n" +
			"  dimension { name 'city'; sql 'city'; type 'string' }\n" +
			"\n" +
			"  // Conditional — map channel codes to labels\n" +
			"  dimension {\n" +
			"    name 'channel_label'\n" +
			"    type 'string'\n" +
			"    case_ {\n" +
			"      when sql: \"${CUBE}.sales_channel = 'web'\", label: 'Website'\n" +
			"      when sql: \"${CUBE}.sales_channel = 'pos'\", label: 'In-Store'\n" +
			"      else_ label: 'Other'\n" +
			"    }\n" +
			"  }\n" +
			"\n" +
			"  // Time\n" +
			"  dimension { name 'sold_at'; sql 'sold_at'; type 'time'; order 'desc' }\n" +
			"\n" +
			"  // Geo — for map visualization\n" +
			"  dimension {\n" +
			"    name 'store_location'\n" +
			"    type 'geo'\n" +
			"    latitude { sql '${CUBE}.store_lat' }\n" +
			"    longitude { sql '${CUBE}.store_lng' }\n" +
			"  }\n" +
			"\n" +
			"  // KPI measures with drill-down\n" +
			"  measure {\n" +
			"    name 'total_transactions'; type 'count'\n" +
			"    drill_members 'sale_id', 'channel', 'sold_at'\n" +
			"  }\n" +
			"  measure { name 'revenue'; sql 'revenue'; type 'sum'; format 'currency' }\n" +
			"  measure { name 'avg_sale'; sql 'revenue'; type 'avg'; format 'currency' }\n" +
			"\n" +
			"  // Filtered measure — only online revenue\n" +
			"  measure {\n" +
			"    name 'online_revenue'\n" +
			"    sql 'revenue'\n" +
			"    type 'sum'\n" +
			"    format 'currency'\n" +
			"    filters {\n" +
			"      filter sql: \"${CUBE}.sales_channel = 'web'\"\n" +
			"    }\n" +
			"  }\n" +
			"\n" +
			"  // Star schema joins\n" +
			"  join {\n" +
			"    name 'customers'\n" +
			"    sql '${CUBE}.customer_id = customers.id'\n" +
			"    relationship 'many_to_one'\n" +
			"  }\n" +
			"  join {\n" +
			"    name 'products'\n" +
			"    sql '${CUBE}.product_id = products.id'\n" +
			"    relationship 'many_to_one'\n" +
			"  }\n" +
			"\n" +
			"  // Quick filters\n" +
			"  segment {\n" +
			"    name 'high_value'\n" +
			"    sql '${CUBE}.revenue > 1000'\n" +
			"    description 'Transactions above $1,000'\n" +
			"  }\n" +
			"  segment {\n" +
			"    name 'last_30_days'\n" +
			"    sql \"${CUBE}.sold_at >= CURRENT_DATE - INTERVAL '30 days'\"\n" +
			"  }\n" +
			"\n" +
			"  // Drill-down\n" +
			"  hierarchy {\n" +
			"    name 'geography'\n" +
			"    title 'Geography'\n" +
			"    levels 'country', 'region', 'city'\n" +
			"  }\n" +
			"}";

	/**
	 * One member per thing a cube can get wrong, so that every {@code error} the rules produce has a
	 * cube that produces it. A named cube, because a file may hold several and the mistakes must be
	 * found in each of them.
	 */
	public static final String ERROR_CASES =
			"cube('broken') {\n" +
			"  sql_table 'Orders'\n" +
			"  join { name 'Customers'; sql '${CUBE}.CustomerID = Customers.CustomerID'; relationship 'many_to_one' }\n" +
			"  join { name 'Shippers'; parent 'Customers'; sql 'Customers.Region = Shippers.Region'; relationship 'one_to_many' }\n" +
			"  dimension { name 'OrderID'; sql '${CUBE}.OrderID'; type 'number'; primary_key true }\n" +
			"  dimension { name 'HalfWhere'; type 'geo'; latitude '${CUBE}.Lat' }\n" +
			"  dimension { name 'Where'; type 'geo'; latitude '${CUBE}.Lat'; longitude '${CUBE}.Lng'; order 'asc' }\n" +
			"  dimension { name 'FarAway'; sql '${Shippers.count}'; type 'number'; sub_query true }\n" +
			"  dimension { name 'Sideways'; sql '${CUBE}.ShipCountry'; type 'string'; order 'sideways' }\n" +
			"  measure { name 'Median'; sql '${CUBE}.Freight'; type 'median' }\n" +
			"  measure { name 'Dotted'; sql '${Customers.Region}'; type 'sum' }\n" +
			"  measure { name 'Nope'; sql '${NotAMeasure} + 1'; type 'number' }\n" +
			"  hierarchy { name 'Nowhere'; levels(['NoSuchDimension']) }\n" +
			"}";

	/** Every sample, by name, in the order they are declared. */
	public static Map<String, String> all() {
		Map<String, String> all = new LinkedHashMap<>();
		all.put("CRM_CUSTOMER_LIST", CRM_CUSTOMER_LIST);
		all.put("ECOMMERCE_REVENUE_DASHBOARD", ECOMMERCE_REVENUE_DASHBOARD);
		all.put("COMPLETED_ORDERS_FILTERED_KPIS", COMPLETED_ORDERS_FILTERED_KPIS);
		all.put("CUSTOMER360_WITH_ORDER_STATS", CUSTOMER360_WITH_ORDER_STATS);
		all.put("PRODUCT_SALES_STAR_SCHEMA", PRODUCT_SALES_STAR_SCHEMA);
		all.put("CLOTHING_STORE_SIZE_LABELS", CLOTHING_STORE_SIZE_LABELS);
		all.put("DELIVERY_FLEET_TRACKER", DELIVERY_FLEET_TRACKER);
		all.put("RETAIL_CHAIN_STORE_LOCATOR", RETAIL_CHAIN_STORE_LOCATOR);
		all.put("FINANCE_INTERNAL_STAGING_CUBE", FINANCE_INTERNAL_STAGING_CUBE);
		all.put("REGIONAL_ORDERS_EXTENDS", REGIONAL_ORDERS_EXTENDS);
		all.put("MULTI_DEPARTMENT_DASHBOARD", MULTI_DEPARTMENT_DASHBOARD);
		all.put("SALES_PIPELINE_FULL_MODEL", SALES_PIPELINE_FULL_MODEL);
		return all;
	}
}
