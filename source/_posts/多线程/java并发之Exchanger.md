---
title: java并发之Exchanger
date: 2017-11-22 17:28:52
tags:
- 多线程
categories:
- java基础
---

# java并发之Exchanger

Exchanger可以在两个线程之间交换数据，只能是2个线程，他不支持更多的线程之间互换数据。


当线程A调用Exchange对象的exchange()方法后，他会陷入阻塞状态，直到线程B也调用了exchange()方法，然后以线程安全的方式交换数据，之后线程A和B继续运行

<!--more-->

## 用法

```java
public class ExchangerTest {
  public static void main(String[] args) {
    ExecutorService service = Executors.newCachedThreadPool();
    final Exchanger exchanger = new Exchanger();
    service.execute(new Runnable(){
      public void run() {
        try {				

          String data1 = "zxx";
          System.out.println("线程" + Thread.currentThread().getName() + 
                             "正在把数据" + data1 +"换出去");
          Thread.sleep((long)(Math.random()*10000));
          String data2 = (String)exchanger.exchange(data1);
          System.out.println("线程" + Thread.currentThread().getName() + 
                             "换回的数据为" + data2);
        }catch(Exception e){

        }
      }	
    });
    service.execute(new Runnable(){
      public void run() {
        try {				

          String data1 = "lhm";
          System.out.println("线程" + Thread.currentThread().getName() + 
                             "正在把数据" + data1 +"换出去");
          Thread.sleep((long)(Math.random()*10000));					
          String data2 = (String)exchanger.exchange(data1);
          System.out.println("线程" + Thread.currentThread().getName() + 
                             "换回的数据为" + data2);
        }catch(Exception e){

        }				
      }	
    });		
  }
}
/*
线程pool-1-thread-1正在把数据zxx换出去
线程pool-1-thread-2正在把数据lhm换出去
线程pool-1-thread-2换回的数据为zxx
线程pool-1-thread-1换回的数据为lhm
*/
```