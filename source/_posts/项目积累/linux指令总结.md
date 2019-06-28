---
title: linux指令总结
date: 2019-06-26 19:43:51
tags:
- todo
categories:
- 项目积累
---

# linux指令总结



<!--more-->

- 查看gc情况

  ```shell
  jstat -gcutil 623765 1000 10  # pid 时间间隔  次数
  ```

  ```properties
   S0     S1       E      O      M     CCS     YGC    YGCT     FGC    FGCT     GCT 
   0.00  92.20   9.83  22.09  95.41  93.07    325   36.618     4    0.699   37.317
  S0：幸存1区当前使用比例
  S1：幸存2区当前使用比例
  E：伊甸园区使用比例
  O：老年代使用比例
  M：元数据区使用比例
  CCS：压缩使用比例
  YGC：年轻代垃圾回收次数
  FGC：老年代垃圾回收次数
  FGCT：老年代垃圾回收消耗时间
  GCT：垃圾回收消耗总时间     
  ```

  