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

## 用法

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
      if (!cacheValid) {
        cacheValid = true;
        obj = 1;
      }
      // Downgrade by acquiring read lock before releasing write lock
      rwl.readLock().lock();
      rwl.writeLock().unlock(); // Unlock write, still hold read

    }
    rwl.readLock().unlock();
    return obj;
  }
}
}
```

