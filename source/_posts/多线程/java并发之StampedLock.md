---
title: java并发之StampedLock
date: 2017-10-29 09:37:47
tags:
- 多线程
categories:
- java基础

---

# java并发之StampedLock 

StamedLock 防止读线程多的时候写线程饥饿现象，读不阻塞写，写成功后重读

<!--more-->