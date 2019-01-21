---
title: redis分布式锁
date: 2019-01-20 19:13:30
tags:
- utils
categories:
- 项目积累
---

# redis分布式锁

```java
@Component
@Slf4j
public class RedisLockUtil {

    private static final long ONE_SECONDS_NANOS = 1 * 1000 * 1000 * 1000;
    /**
     * 默认锁过期时间单位秒
     */
    private static final int DEFAULT_KEY_EXPIRE = 120;

    private static final Random r = new Random();
    /**
     * 默认lock key前缀
     */
    private static final String PRE = "ISCAP_LOCK_";

    @Resource
    private RedisClient redisClient;


    /**
     * 针对key加锁
     *
     * @param key     要锁定的key
     * @param timeout 超时时间，单位秒
     * @return
     */
    public boolean acquireLock(String key, int timeout) {
        String redisKey = buildRedisKey(key);
        //计算超时时间
        long nanoTime = System.nanoTime() + timeout * ONE_SECONDS_NANOS + 1;
        try {
            //自旋锁、精确到纳秒
            while ((nanoTime - System.nanoTime()) > 0) {
                //如果获取锁则返回
                if (redisClient.String().setnx(redisKey, "1")) {//此处可以使用 lua脚本将setnx和expire实现原子性
                    redisClient.Key().expire(redisKey, DEFAULT_KEY_EXPIRE);//设置失效时间，防止一直不释放锁
                    return true;
                }
                // 短暂休眠，nano避免出现活锁
                Thread.sleep(30, r.nextInt(500));
            }
            log.info("key:{},timeout:{}获取锁超时！", redisKey, timeout);
        } catch (Exception e) {
            log.error("key:{},timeout:{}获取锁异常！{}", redisKey, timeout, e.getMessage());
        }
        return false;
    }

    /**
     * 释放锁
     *
     * @param key
     */
    public void unlock(final String key) {
        String redisKey = buildRedisKey(key);
        //重试3次去删除key 释放锁
        RetryUtil.runMaxTimes(() -> {
            redisClient.Key().del(redisKey);
        }, 3, "释放锁" + redisKey);
    }

    private String buildRedisKey(String key) {
        return PRE + key;
    }
}
```