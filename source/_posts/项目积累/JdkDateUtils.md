---
title: JdkDateUtils
date: 2019-01-20 19:15:30
tags:
- utils
categories:
- 项目积累
---

# JdkDateUtils

用于转换jdk8中LocalDateTime和Date之间的转换

```java
import org.springframework.util.StringUtils;

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.Date;

/**
 * 基于jdk1.8的日期转换
 *
 * @author lizhi.zhang
 * @create 2018-03-12 下午8:33
 **/
public class JdkDateUtils {


    private static final String DATE_TIME_DEFAULT_PATTERN = "yyyy-MM-dd HH:mm:ss";
    private static final String DATE_DEFAULT_PATTERN = "yyyy-MM-dd";

    /**
     * localDateTime 转换 date
     *
     * @param localDateTime
     * @return date
     */
    public static Date localDateTime2Date(LocalDateTime localDateTime) {
        if (localDateTime == null) {
            return null;
        }
        ZoneId zone = ZoneId.systemDefault();
        Instant instant = localDateTime.atZone(zone).toInstant();
        return Date.from(instant);
    }

    /**
     * date 转换 localDateTime
     *
     * @param date 日期
     * @return localDateTime
     */
    public static LocalDateTime date2LocalDateTime(Date date) {
        if (date == null) {
            return null;
        }
        Instant instant = date.toInstant();
        ZoneId zoneId = ZoneId.systemDefault();
        return LocalDateTime.ofInstant(instant, zoneId);

    }

    /**
     * localDate 转换 date
     *
     * @param localDate 日期
     * @return date
     */
    public static Date localDate2Date(LocalDate localDate) {
        if (localDate == null) {
            return null;
        }
        ZoneId zoneId = ZoneId.systemDefault();
        ZonedDateTime zdt = localDate.atStartOfDay(zoneId);
        return Date.from(zdt.toInstant());
    }

    /**
     * date 转换 localDate
     *
     * @param date 日期
     * @return localDate
     */
    public static LocalDate date2LocalDate(Date date) {
        if (date == null) {
            return null;
        }
        Instant instant = date.toInstant();
        ZoneId zoneId = ZoneId.systemDefault();
        return instant.atZone(zoneId).toLocalDate();
    }

    /**
     * 格式化日期
     *
     * @param date    日期
     * @param pattern 格式
     * @return 格式化的日志字符串
     */
    public static String format(Date date, String pattern) {
        if (date == null) {
            return null;
        }
        if (StringUtils.isEmpty(pattern)) {
            pattern = DATE_TIME_DEFAULT_PATTERN;
        }
        LocalDateTime localDateTime = JdkDateUtils.date2LocalDateTime(date);
        return localDateTime.format(DateTimeFormatter.ofPattern(pattern));
    }

    /**
     * 格式化日期+时间
     *
     * @param dateStr 日期
     * @param pattern 格式
     * @return 格式化的日志字符串
     */
    public static Date parseDateTime(String dateStr, String pattern) {
        if (StringUtils.isEmpty(dateStr)) {
            return null;
        }
        if (StringUtils.isEmpty(pattern)) {
            pattern = DATE_TIME_DEFAULT_PATTERN;
        }
        LocalDateTime localDateTime = LocalDateTime.parse(dateStr, DateTimeFormatter.ofPattern(pattern));
        return JdkDateUtils.localDateTime2Date(localDateTime);
    }

    /**
     * 格式化日期
     *
     * @param dateStr 日期
     * @param pattern 格式
     * @return 格式化的日志字符串
     */
    public static Date parseDate(String dateStr, String pattern) {
        if (StringUtils.isEmpty(dateStr)) {
            return null;
        }
        if (StringUtils.isEmpty(pattern)) {
            pattern = DATE_DEFAULT_PATTERN;
        }
        LocalDate localDate = LocalDate.parse(dateStr, DateTimeFormatter.ofPattern(pattern));
        return JdkDateUtils.localDate2Date(localDate);
    }
}
```