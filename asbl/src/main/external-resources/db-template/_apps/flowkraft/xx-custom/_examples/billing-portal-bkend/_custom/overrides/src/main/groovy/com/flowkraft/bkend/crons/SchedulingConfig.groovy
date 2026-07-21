package com.flowkraft.bkend.crons

import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling

// Turns on @Scheduled for the billing cron — added as its own config so the foundational
// BkendApplication is left exactly as the blueprint ships it.
@Configuration
@EnableScheduling
class SchedulingConfig {
}
