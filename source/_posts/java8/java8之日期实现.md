---
title: java8之日期实现
date: 2017-08-05 14:58:46
tags:
- java8
categories:
- java基础
---

# java8之日期实现

## 历史问题

- jdk api中提供了两类日期实现Date和Calendar，存在一些缺陷和不足
  1. Date的实现是年份从1900年开始，月份是从0开始
  2. DateForm不是线程安全的，多线程 并发时会出现不可知的问题
  3. Date和Calendar是可变类
  4. 日期的toString输出的格式不够人性化



## JDK8 接口定义

- **TemporalAccessor**:定义日期类的查询接口

- **Temporal**:继承**TemporalAccessor**，扩展定义了日期的修改接口，必须是连续时间的类型实现接口

  ```java
  default Temporal with(TemporalAdjuster adjuster);//提供了默认实现
  Temporal with(TemporalField field, long newValue);
  default Temporal plus(TemporalAmount amount);//提供了默认实现
  Temporal plus(long amountToAdd, TemporalUnit unit);
  long until(Temporal endExclusive, TemporalUnit unit);
  ```

- **TemporalAdjuster** :调整时间，函数式接口，定义了adjustInto方法，让子类实现，jdk通过TemporalAdjusters提供了一些默认实现

  ```java
  Temporal adjustInto(Temporal temporal);//接口
  //以下两种实现 使用adjust对应field
  temporal = thisAdjuster.adjustInto(temporal);
  temporal = temporal.with(thisAdjuster);//推荐使用with
  ```

- **TemporalAmount**：一段时间的接口，主要实现类 Period和Duration

  ```java
  long get(TemporalUnit unit);
  List<TemporalUnit> getUnits();
  Temporal addTo(Temporal temporal);
  Temporal subtractFrom(Temporal temporal);
  ```

- **TemporalUnit** ：时间单位，主要实现类为ChronoUnit

  ```java
  Duration getDuration();//接口中主要是定义了单位对应的时间长度
  <R extends Temporal> R addTo(R temporal, long amount);//访问者模式
  ```

  ChronoUnit

  ```java
  MINUTES("Minutes", Duration.ofSeconds(60)),//定义枚举对象，各个枚举对应的时间长度
  @Override
  public <R extends Temporal> R addTo(R temporal, long amount) {  //访问者模式
      return (R) temporal.plus(amount, this);
  }
  @Override
  public long between(Temporal temporal1Inclusive, Temporal temporal2Exclusive) {
      return temporal1Inclusive.until(temporal2Exclusive, this);
  }
  ```

- **TemporalField** ：日期field的抽象，主要实现是ChronoField枚举
  ```java
  long getFrom(TemporalAccessor temporal); //访问者模式
  <R extends Temporal> R adjustInto(R temporal, long newValue);
  ```
  ChronoField

  ```java
  private final String name;
  private final TemporalUnit baseUnit;
  private final TemporalUnit rangeUnit;
  private final ValueRange range;
  private final String displayNameKey;
  
  private ChronoField(String name, TemporalUnit baseUnit, TemporalUnit rangeUnit, ValueRange range) {
      this.name = name;
      this.baseUnit = baseUnit;
      this.rangeUnit = rangeUnit;
      this.range = range;
      this.displayNameKey = null;
  }
  @Override
  public long getFrom(TemporalAccessor temporal) {
      return temporal.getLong(this);
  }
  
  @SuppressWarnings("unchecked")
  @Override
  public <R extends Temporal> R adjustInto(R temporal, long newValue) {
      return (R) temporal.with(this, newValue);
  }
  ```

- **TemporalQuery**: 函数式接口，定义了查询抽象方法，jdk通过TemporalQueries提供了一些默认实现

  ```java
  R queryFrom(TemporalAccessor temporal);
  ```

  

## JDK8新增的日期类

### LocalDate

localDate.of

### LocalTime

它包含了时间与日期，不过没有带时区的偏移量

### LocalDateTime

包含了LocalDate和LocalTim

###  ZonedDateTime

这是一个包含时区的完整的日期时间，偏移量是以UTC/格林威治时间为基准的。

### OffsetDateTime

### MonthDay

处理一个月，一般配合TemporalAdjusters一起使用，用于调整日期

### YearMonth

处理年月，一般配合TemporalAdjusters一起使用，用于调整日期

### Clock

时钟接口，通过内部类提供了一些实现，用于获取某个时区下当前的瞬时日期或者时间。
可以用Clock来替代System.currentTimeInMillis()与 TimeZone.getDefault()方法
```java
Clock.systemDefaultZone().millis()  === System.currentTimeMillis();
Instant instant = Clock.systemDefaultZone().instant();//获取instant
```

### Instant

设计初衷是为了机器使用方便，是1970年1月1日到现在的秒数,事实上Instant就是Java 8前的Date，你可以使用这两个类中的方法来在这两个类型之间进行转换，

```java
Date date = Date.from(instant);//将instant转换为Date类型
Instant instant = date.toInstant();//将Date转换为instant类型
```

### Duration

由于Duration类主要用于以秒和纳秒衡量时间的长短，你不能仅向between方法传递一个LocalDate对象做参数。

### Period

如果需要以年、月或者日的方式对多个时间单位建模，可以使用Period类。使用该类的工厂方法between，你可以使用得到两个LocalDate之间的时长

### ValueRange

一段，保存起始和结束标示

### ZoneId

处理时期

### ZoneOffset

### DateTimeFormatter