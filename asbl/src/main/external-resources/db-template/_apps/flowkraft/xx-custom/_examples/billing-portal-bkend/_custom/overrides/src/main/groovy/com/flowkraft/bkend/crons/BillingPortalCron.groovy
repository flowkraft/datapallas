package com.flowkraft.bkend.crons

import org.slf4j.Logger
import org.slf4j.LoggerFactory
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

import java.sql.Connection
import java.sql.DriverManager
import java.text.SimpleDateFormat

/**
 * The billing-portal backend cron. Each billing portal (Grails, Next) writes its SQLite DB file into
 * the shared dir mounted at /app/shared. This cron opens those DB files DIRECTLY and flips DUE
 * invoices past their due date to OVERDUE — no REST, the bkend shares the portals' database.
 *
 * The two portals store the same bp_ data with slightly different conventions (GORM vs Drizzle), so
 * due_date is parsed flexibly (ISO text, timestamp text, or epoch millis). Runs once ~6s after
 * startup (deterministic for the E2E) and then on the configured schedule.
 */
@Component
class BillingPortalCron {

    private static final Logger log = LoggerFactory.getLogger(BillingPortalCron)
    private static final String SHARED_DIR = '/app/shared'

    @EventListener(ApplicationReadyEvent)
    void onReady() {
        Thread.start {
            sleep(6000)
            markOverdue()
        }
    }

    @Scheduled(cron = '${BP_CRON_MARK_OVERDUE:0 0 * * * *}')
    void scheduled() {
        markOverdue()
    }

    void markOverdue() {
        File dir = new File(SHARED_DIR)
        File[] dbs = dir.isDirectory() ? dir.listFiles({ File f -> f.name.endsWith('.db') } as FileFilter) : null
        if (!dbs || dbs.length == 0) {
            log.info('[billing-cron] no portal DB files in {} yet', SHARED_DIR)
            return
        }
        dbs.each { File db -> markOverdueIn(db) }
    }

    private void markOverdueIn(File db) {
        Connection conn = null
        try {
            conn = DriverManager.getConnection('jdbc:sqlite:' + db.absolutePath)
            conn.createStatement().execute('PRAGMA busy_timeout=8000')

            List<Integer> overdue = []
            Date now = new Date()
            def rs = conn.createStatement().executeQuery("SELECT id, due_date FROM bp_invoice WHERE status = 'DUE'")
            while (rs.next()) {
                Date dueDate = parseDate(rs.getString('due_date'))
                if (dueDate != null && dueDate.before(now)) overdue << (rs.getInt('id'))
            }
            rs.close()

            overdue.each { Integer id ->
                conn.createStatement().executeUpdate("UPDATE bp_invoice SET status = 'OVERDUE' WHERE id = " + id)
            }
            log.info('[billing-cron] {} -> marked {} invoice(s) OVERDUE', db.name, overdue.size())
        } catch (Exception e) {
            // The bp_invoice table may not exist yet if the portal is still booting — retried next tick.
            log.warn('[billing-cron] {}: {}', db.name, e.message)
        } finally {
            if (conn != null) try { conn.close() } catch (ignored) { }
        }
    }

    /** Parse a stored due_date: ISO 'yyyy-MM-dd', timestamp text, or epoch millis. */
    private static Date parseDate(String s) {
        if (!s) return null
        s = s.trim()
        if (s.isLong()) return new Date(s.toLong())
        for (String fmt : ['yyyy-MM-dd', 'yyyy-MM-dd HH:mm:ss', "yyyy-MM-dd'T'HH:mm:ss"]) {
            try {
                return new SimpleDateFormat(fmt).parse(s.length() >= fmt.length() ? s.substring(0, fmt.length()) : s)
            } catch (Exception ignored) { }
        }
        return null
    }
}
