---
title: BigDecimalUtil
date: 2019-01-20 19:14:30
tags:
- utils
categories:
- 项目积累
---

# BigDecimalUtil

主要用于针对BigDecimal进行格式化处理。后续需求需要运算，再添加

```java
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.util.stream.Collectors;
import java.util.stream.IntStream;


/**
 * 处理bigdecimal
 *
 * @author lizhi.zhang
 * @create 2018-05-11 上午10:41
 **/
public class BigDecimalUtil {

    public static BigDecimal mindownZero(BigDecimal value) {
        value = convertNull2Zero(value);
        return value.compareTo(BigDecimal.ZERO) < 0 ? BigDecimal.ZERO : value;
    }

    /**
     * 格式化bigDecimal 默认四舍五入
     *
     * @param value 值
     * @param scale 精度
     * @return
     */
    public static String formatBigDecimal(BigDecimal value, int scale) {
        return formatBigDecimal(value, scale, null);
    }

    /**
     * 格式化bigDecimal
     *
     * @param value        值
     * @param scale        精度
     * @param roundingMode 取舍方式
     * @return
     */
    public static String formatBigDecimal(BigDecimal value, int scale, RoundingMode roundingMode) {
        String format = IntStream.range(0, scale).boxed().map(s -> "0").collect(Collectors.joining("", "0.", ""));

        DecimalFormat df = new DecimalFormat(format);
        roundingMode = roundingMode == null ? RoundingMode.HALF_UP : roundingMode;
        df.setRoundingMode(roundingMode);
        value = convertNull2Zero(value);
        if (BigDecimal.ZERO.compareTo(value) == 0) {
            return "0";
        }
        return df.format(convertNull2Zero(value));
    }

    /**
     * 将空转换为0
     *
     * @param value
     * @return
     */
    public static BigDecimal convertNull2Zero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
```