---
title: java并发之ReentrantReadWriteLock
date: 2017-11-22 17:24:45
tags:
- 多线程
categories:
- java基础
---

# java并发之ReentrantReadWriteLock

ReentrantReadWriteLock是读写分离锁

<!--more-->

当前线程加了 读锁，只能再加读锁，不能再加写锁了，但是加了写锁可以再加读锁和写锁

## 用法

锁降级

```java
class CashData {
    Object obj;
    volatile boolean cacheValid;
    ReentrantReadWriteLock rwl = new ReentrantReadWriteLock();
    public Object load() {
        rwl.readLock().lock();
        if (!cacheValid) {
            // 释放读锁
            rwl.readLock().unlock();
            // 要进行赋值，添加写锁
            rwl.writeLock().lock();
            try{
                if (!cacheValid) {
                    cacheValid = true;
                    obj = 1;
                }
                rwl.readLock().lock();
            }finally{
                rwl.writeLock().unlock(); // Unlock write, still hold read
            }

        }
        rwl.readLock().unlock();
        return obj;
    }
}
}
```

