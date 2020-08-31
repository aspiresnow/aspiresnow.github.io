---
title: redis分布式锁-实现2
date: 2019-06-13 20:13:30
tags:
- utils
categories:
- 项目积累
---

# redis分布式锁-实现2

redis分布式锁的另一种实现。

redis分布式锁实现是一种AP实现。redis实现主要依赖redis的 sexnx指令，即只有key不存在的时候才能设置一个key，在实现的时候需要考虑以下几种情况

- 为了防止线程加锁后down掉而没有删除key，导致其他线程永远无法加锁，所以要给key设置过期时间。
- setnx 和  px要保证原子实现
- 由于设置了过期时间，要尽量保证锁内的逻辑要在这个时间段内能执行完毕
- 如果在key超时时间内，代码逻辑没有执行完，在解锁删除key的时候，如果其他线程已经加锁了，删除key的时候就不能去删除了

该方案是通过实现Lock接口，提供一种标准化的分布式锁实现方案

1. 引入pom配置

   ```xml
   <dependency>
       <groupId>org.springframework.boot</groupId>
       <artifactId>spring-boot-starter-web</artifactId>
   </dependency>
   <dependency>
       <groupId>org.springframework.boot</groupId>
       <artifactId>spring-boot-starter-data-redis</artifactId>
       <exclusions>
           <exclusion>
               <artifactId>lettuce-core</artifactId>
               <groupId>io.lettuce</groupId>
           </exclusion>
       </exclusions>
   </dependency>
   <dependency>
       <groupId>redis.clients</groupId>
       <artifactId>jedis</artifactId>
   </dependency>
   ```

2. 提供Lock的分布式锁默认抽象实现

```java
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.Lock;

public abstract class DistrubutedLockUnsupportAdapter implements Lock {
    public DistrubutedLockUnsupportAdapter() {
    }

    @Override
    public void lock() {
        throw new UnsupportedOperationException();
    }

    @Override
    public void lockInterruptibly() throws InterruptedException {
        throw new UnsupportedOperationException();
    }

    @Override
    public boolean tryLock() {
        throw new UnsupportedOperationException();
    }

    @Override
    public boolean tryLock(long time, TimeUnit unit) throws InterruptedException {
        throw new UnsupportedOperationException();
    }

    @Override
    public void unlock() {
        throw new UnsupportedOperationException();
    }

    @Override
    public Condition newCondition() {
        throw new UnsupportedOperationException();
    }
}
```

3. 做redis分布式锁的实现，同时实现 AutoCloseable接口，可以使用java新特性中的try - resource。该实现方案是依赖spring中的jedis和redisTemplate，如果使用其他client端，需要修改代码

```java
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.RedisTemplate;
import redis.clients.jedis.JedisCommands;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.LockSupport;

public class RedisDistrubutedLock extends DistrubutedLockUnsupportAdapter implements Lock, AutoCloseable {
    /**
     * 默认持有锁超时时间
     */
    private static final long DEFAULT_MAX_LOCK_TIME_SECONDS = 30L;
    private static final long PARK_TIME = 100L;
    /**
     * redis锁key的前缀
     */
    private static final String KEY_PREFIX = "REDIS_LOCK_";
    /**
     * 强依赖redisTemplate
     */
    private final RedisTemplate<String, Object> redisTemplate;
    /**
     * 锁的key
     */
    private final String key;
    /**
     * 持有锁的超时时间
     */
    private final long maxLockTime;
    /**
     * 持有锁的超时时间单位
     */
    private final TimeUnit timeUnit;
    /**
     * 持有锁的线程
     */
    private volatile Thread holder;
    /**
     * redis的value 删除的时候判断，避免删除其他线程的key
     */
    private String value;

    /**
     * 构造器
     *
     * @param redisTemplate
     * @param key
     * @param maxLockTime
     * @param timeUnit
     */
    public RedisDistrubutedLock(RedisTemplate<String, Object> redisTemplate, String key, long maxLockTime, TimeUnit timeUnit) {
        this.redisTemplate = redisTemplate;
        this.key = key;
        this.maxLockTime = maxLockTime;
        this.timeUnit = timeUnit;
    }

    /**
     * 构造器
     *
     * @param redisTemplate
     * @param key
     * @param maxLockTime   持有锁的超时时间 微秒
     */
    public RedisDistrubutedLock(RedisTemplate redisTemplate, String key, long maxLockTime) {
        this(redisTemplate, key, maxLockTime, TimeUnit.MILLISECONDS);
    }

    /**
     * 构造器 默认最大持有时间 30秒
     *
     * @param redisTemplate
     * @param key
     */
    public RedisDistrubutedLock(RedisTemplate redisTemplate, String key) {
        this(redisTemplate, key, DEFAULT_MAX_LOCK_TIME_SECONDS, TimeUnit.SECONDS);
    }


    /**
     * 加锁，重试直到加锁成功
     */
    @Override
    public void lock() {
        int retryTimes = 0;
        //自旋
        while (!this.acquireLock()) {
            ++retryTimes;
            //避免线程同一时间加锁，竞争，同时随着重试次数越来越多，停顿时间越来越长
            LockSupport.parkNanos(TimeUnit.MICROSECONDS.toNanos(PARK_TIME * retryTimes));
        }
    }

    /**
     * 可中断加锁
     *
     * @throws InterruptedException
     */
    @Override
    public void lockInterruptibly() throws InterruptedException {
        int retryTimes = 0;
        while (!this.acquireLock()) {
            ++retryTimes;
            //避免线程同一时间加锁，竞争，同时随着重试次数越来越多，停顿时间越来越长
            LockSupport.parkNanos(TimeUnit.MICROSECONDS.toNanos(PARK_TIME * retryTimes));
            //可中断
            if (Thread.interrupted()) {
                throw new InterruptedException();
            }
        }
    }

    /**
     * 尝试加锁
     *
     * @return
     */
    @Override
    public boolean tryLock() {
        return this.acquireLock();
    }

    /**
     * 尝试加锁，直到时间截止或者被中断
     *
     * @param time
     * @param unit
     * @return
     * @throws InterruptedException
     */
    @Override
    public boolean tryLock(long time, TimeUnit unit) throws InterruptedException {
        int retryTimes = 0;
        long deadLine = Instant.now().toEpochMilli() + unit.toMillis(time);

        do {
            //自旋 超时返回false
            if (deadLine <= Instant.now().toEpochMilli()) {
                return false;
            }
            //加锁成功返回true
            if (this.acquireLock()) {
                return true;
            }
            ++retryTimes;
            //避免线程同一时间加锁，竞争，同时随着重试次数越来越多，停顿时间越来越长
            LockSupport.parkNanos(TimeUnit.MICROSECONDS.toNanos(PARK_TIME * retryTimes));
        } while (!Thread.interrupted());
        //中断后抛出中断异常
        throw new InterruptedException();
    }

    /**
     * 加锁，向redis中set key
     *
     * @return
     */
    private boolean acquireLock() {
        boolean flag = redisTemplate.execute((RedisCallback<Boolean>) connection -> {
            JedisCommands commands = JedisCommands.class.cast(connection.getNativeConnection());
            //设置一个随机值
            String value = UUID.randomUUID().toString();
            String result = commands.set(this.getKey(), value, "NX", "PX", this.timeUnit.toMillis(RedisDistrubutedLock.this.maxLockTime));
            if ("OK".equals(result)) {
                //设置成功，赋值value，可以在删除key的时候使用
                this.value = value;
                return true;
            }
            return false;
        });
        if (flag) {
            this.holder = Thread.currentThread();
        }
        return flag;
    }

    /**
     * 解锁
     */
    @Override
    public void unlock() {
        //持有锁的线程跟当前线程一致 才去删除key，避免key过期其他线程加锁，然后删除其他线程加锁的key
        //最好是再有个lua脚本，判断value是否一致再去删除
        if (this.holder == Thread.currentThread()) {
            boolean flag = redisTemplate.execute((RedisCallback<Boolean>) connection -> {
                JedisCommands commands = JedisCommands.class.cast(connection.getNativeConnection());
                return commands.del(this.getKey()) > 0L;
            });
            this.holder = null;
        }
    }

    /**
     * 获取key
     *
     * @return
     */
    private String getKey() {
        return KEY_PREFIX + this.key;
    }

    /**
     * 可以使用 try() -> resource
     */
    @Override
    public void close() {
        this.unlock();
    }
}
```

4. 使用

```java
@Test
    public void testRedisLock() {
        String key = "test_lock";
        Lock lock = new RedisDistrubutedLock(redisTemplate, key);
        try {
            lock.lock();
            //doSomething
//            log.info("》》》》》加锁成功");
//            lock.lock();
//            log.info("》》》》》再次加锁成功");//隔30秒后再次加锁成功 键失效
        } finally {
            lock.unlock();
        }
    }
```

使用try-resource，自动调用close方法中的unlock

```java
@Test
public void testTryResourceLock() {
    String key = "test_lock";
    try (RedisDistrubutedLock redisDistrubutedLock = new RedisDistrubutedLock(redisTemplate, key)) {
        boolean flag = redisDistrubutedLock.tryLock();
        log.info("》》》》》加锁:{}", flag ? "成功" : "失败");
    }
    try (RedisDistrubutedLock redisDistrubutedLock = new RedisDistrubutedLock(redisTemplate, key)) {
        boolean flag = redisDistrubutedLock.tryLock();
        log.info("》》》》》再次加锁:{}", flag ? "成功" : "失败");
    }
}
```