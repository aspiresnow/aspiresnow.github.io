---
title: java并发之CompletableFuture
date: 2017-08-05 12:58:46
tags:
- java8
- 多线程
categories:
- java基础
---

# java并发之CompletableFuture

CompletableFuture实现了Future接口，是jdk8新添加的对与并发编程的扩展支持。通过CompletableFuture可以方便的操作多个异步任务、执行结果的回调等操作。

## CompletableFuture优点

jdk8之前的Future接口也可以构建异步任务，并且通过get()阻塞获取异步任务的结果。但是依然存在一些局限性，只能阻塞或者轮询去监控获取异步任务的结果，jdb8中的CompletableFuture实现了Future接口，同时扩展了异步编程中更多的需求

- 可以在异步任务异常或者完成的时候回调通知监听者
- 异步任务完成之后直接参与下个流程
- 将两个异步任务合并为一个异步任务，其中的两个异步任务可以依次依赖执行，也可以同时执行
- 仅获取多个异步任务中最快结束的任务返回结果
- parallelStream使用默认的ForkJoinPool无法修改线程数，而CompletableFuture可以指定线程池，默认跟parallelStream用的是一样的线程池


## 用法

jdk8之前使用futureTask创建一个有返回值的异步线程

```java
Callable callable = () -> 0d;
FutureTask<Double> future = new FutureTask<Double>(callable);
Thread thread = new Thread(future);
thread.start();
System.out.println(future.get());
```

jdk8提供了CompletableFuture，同样实现了future接口，可以通过以下方式创建一个带返回结果的异步任务

```java
CompletableFuture<Double> completableFuture = new CompletableFuture();
Thread thread = new Thread(() -> {
  try {
    double price = getPrice(product);
    completableFuture.complete(price);
  } catch (Exception e) {
    //发生异常时，工作线程会被kill，使用future将异常传递给调用线程
    completableFuture.completeExceptionally(e);
  }
});
thread.start();
System.out.println(completableFuture.get());
```

CompletableFuture提供了静态方法，直接创建异步任务，同时也可以指定线程池，如果不指定，默认使用ForkJoinPool.commonPool()

- 创建不带返回结果的异步任务

  ```java
  public static CompletableFuture<Void> runAsync(Runnable runnable)
  public static CompletableFuture<Void> runAsync(Runnable runnable,Executor executor)
  ```

- 创建带返回结果的异步任务

  ```java
  public static <U> CompletableFuture<U> supplyAsync(Supplier<U> supplier) 
  public static <U> CompletableFuture<U> supplyAsync(Supplier<U> supplier,Executor executor)
  ```

### 获取值

CompletableFuture提供了多种获取异步任务返回值的方法


```java
public T    get()  //阻塞等待直到有返回结果,抛出检查性异常
public T    get(long timeout, TimeUnit unit)  //阻塞等待指定时间,抛出检查性异常抛出非检查性异常
public T    getNow(T valueIfAbsent)  //如果结果已经计算完则返回结果或抛异常，否则返回给定的valueIfAbsent的值。
public T    join()  //阻塞等待直到有返回结果，抛出非检查性异常，当任务异常后，join会抛出RuntimeException,多次调用join会抛出CompletionException异常
```

### 状态检查

可以通过isDone检查异步任务是否执行完毕，isCompletedExceptionally检查异步任务是否抛出异常结束

```java
public boolean isDone()
public boolean isCompletedExceptionally()
```

### 异步链式

CompletableFuture的异步链式方法都提供了三个类型

- 同一线程:跟调用者CompletableFuture使用同一个线程
- Async: 使用`ForkJoinPool.commonPool()`系统级公共线程池中的线程，默认是守护线程，(jvm退出守护线程即消亡)
- Async+指定executor: 使用指定的线程池中的线程执行

```java
static {
        int threadCount = 2;
        AtomicInteger atomicInteger = new AtomicInteger(1);
        executorService = Executors.newFixedThreadPool(threadCount, r -> {
            Thread t = new Thread(Thread.currentThread().getThreadGroup(), r, "test"+atomicInteger.getAndIncrement());
            t.setDaemon(false);
            return t;
        });
    }
```

在执行一组异步操作的时候，一定不要将join和生成CompletableFuture的map放在一个链里面，不然会阻塞

```java
public static void main(String[] args) throws InterruptedException {
  List<String> parameters = Lists.newArrayList("a","b","c","d");
  List<CompletableFuture> futureList = parameters.stream().map(s -> CompletableFuture.supplyAsync(() -> {
    try {
      Thread.currentThread().sleep(1000L);
    } catch (InterruptedException e) {
      e.printStackTrace();
    }
    System.out.println(Thread.currentThread().getName() + "执行完毕:" + s);
    return s;
  },executorService)).collect(Collectors.toList());
  System.out.println("main over");
  //单独放在一个map链里面
  futureList.stream().map(s -> s.join()).forEach(System.out::println);
}
```

#### thenApply

**等待异步返回结果，将异步返回的结果作为参数，执行function转换结果**。thenApply方法会跟异步任务使用同一个线程(异步任务很快的时候测试时用的main线程),Async方法会启用ForkJoinPool中的线程来执行function。如果不想用默认的ForkJoinPool，可以指定一个线程池。

```java
public <U> CompletionStage<U> thenApply(Function<? super T,? extends U> fn);
public <U> CompletionStage<U> thenApplyAsync(Function<? super T,? extends U> fn);
public <U> CompletionStage<U> thenApplyAsync(Function<? super T,? extends U> fn,Executor executor);
```

```java
public static void main(String[] args) throws InterruptedException {
  System.out.println("main start");
  CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> {
    System.out.println(Thread.currentThread().getName() + ": before first");
    try {
      Thread.currentThread().sleep(1000);
    } catch (InterruptedException e) {
    }
    System.out.println(Thread.currentThread().getName() + ": after first");

    return "first";
  }, executorService).thenApplyAsync((s) -> {
    System.out.println(Thread.currentThread().getName() + ": get " + s);
    return "second";
  },executorService);
  System.out.println("main over");
  String join = future.join();
  System.out.println(String.format("future result %s",join));
}
/*
main start
test1: before first
main over
test1: after first
test2: get first
future result second
*/
```

#### thenAccept

等待异步返回结果，将异步返回的结果作为参数，执行consumer消耗结果。同thenApply一样，唯一不同的是该方法没有返回值，直接消费异步结果，不再需要阻塞主线程获取异步结果。

```java
public CompletionStage<Void> thenAccept(Consumer<? super T> action);
public CompletionStage<Void> thenAcceptAsync(Consumer<? super T> action);
public CompletionStage<Void> thenAcceptAsync(Consumer<? super T> action,Executor executor);
```

#### thenRun

等待异步返回结果，然后执行任务。同thenApply一样，唯一不同的是该方法等待异步任务执行完毕后执行自己的任务。

```java
public CompletionStage<Void> thenRun(Runnable action);
public CompletionStage<Void> thenRunAsync(Runnable action);
public CompletionStage<Void> thenRunAsync(Runnable action,Executor executor);
```

#### thenCompose

合并两个异步操作。等待第一个异步任务执行完毕，将结果作为第二个异步任务的参数来执行第二个异步任务

```java
public <U> CompletableFuture<U> thenCompose(Function<? super T, ? extends CompletionStage<U>> fn)
public <U> CompletableFuture<U> thenComposeAsync(Function<? super T, ? extends CompletionStage<U>> fn)
public <U> CompletableFuture<U> thenComposeAsync(Function<? super T, ? extends CompletionStage<U>> fn,public <U> CompletableFuture<U> thenComposeAsync(Function<? super T, ? extends CompletionStage<U>> fn))
```

#### thenCombine

合并两个异步操作。同时执行两个异步操作，等待两个都执行完毕后将两个异步操作的结果合并转换后返回一个future，调用join方法获取结果。

```java
public <U,V> CompletionStage<V> thenCombine(CompletionStage<? extends U> other,BiFunction<? super T,? super U,? extends V> fn);
public <U,V> CompletionStage<V> thenCombineAsync(CompletionStage<? extends U> other,BiFunction<? super T,? super U,? extends V> fn);
public <U,V> CompletionStage<V> thenCombineAsync(CompletionStage<? extends U> other,BiFunction<? super T,? super U,? extends V> fn,Executor executor);
```

```java
public static void main(String[] args) throws InterruptedException {
  System.out.println("main start");
  CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> {
    System.out.println(Thread.currentThread().getName() + ": before first");
    try {
      Thread.currentThread().sleep(1000);
    } catch (InterruptedException e) {
    }
    System.out.println(Thread.currentThread().getName() + ": after first");

    return "first";
  }, executorService).thenCombineAsync(CompletableFuture.supplyAsync(() -> {
    System.out.println(Thread.currentThread().getName() + ": before second");
    try {
      Thread.currentThread().sleep(2000);
    } catch (InterruptedException e) {
    }
    System.out.println(Thread.currentThread().getName() + ": after second");

    return "second";
  },executorService), (s1, s2) ->  s1 + ":" + s2);
  System.out.println("main over");
  String join = future.join();
  System.out.println(String.format("future result %s",join));
}
/*
main start
test1: before first
test1: after first
main over
test2: get first
future result second
*/
```

#### thenAcceptBoth

合并两个异步操作,同thenCombine一样，唯一不同是该方法直接消费两个异步任务的结果，不再需要阻塞主线程获取异步结果

```java
public <U> CompletionStage<Void> thenAcceptBoth(CompletionStage<? extends U> other,BiConsumer<? super T, ? super U> action);
public <U> CompletionStage<Void> thenAcceptBothAsync(CompletionStage<? extends U> other,BiConsumer<? super T, ? super U> action);
public <U> CompletionStage<Void> thenAcceptBothAsync(CompletionStage<? extends U> other,BiConsumer<? super T, ? super U> action,     Executor executor);
```

#### runAfterBoth

合并两个异步操作,同thenCombine一样，唯一不同是该方法等待两个异步任务执行完毕后，执行自己的任务

```java
public CompletionStage<Void> runAfterBoth(CompletionStage<?> other,Runnable action);
public CompletionStage<Void> runAfterBothAsync(CompletionStage<?> other,Runnable action);
public CompletionStage<Void> runAfterBothAsync(CompletionStage<?> other,Runnable action,Executor executor);
```

#### applyToEither

两个异步操作，任意一个返回结果，再调用join的时候就返回接口，其中一个未执行完毕的任务会继续执行

```java
public <U> CompletionStage<U> applyToEither(CompletionStage<? extends T> other,Function<? super T, U> fn);
public <U> CompletionStage<U> applyToEitherAsync(CompletionStage<? extends T> other,Function<? super T, U> fn);
public <U> CompletionStage<U> applyToEitherAsync(CompletionStage<? extends T> other,Function<? super T, U> fn,Executor executor);
```

```java
public static void main(String[] args) throws InterruptedException {
  System.out.println("main start");
  CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> {
    System.out.println(Thread.currentThread().getName() + ": before first");
    try {
      Thread.currentThread().sleep(1000);
    } catch (InterruptedException e) {
    }
    System.out.println(Thread.currentThread().getName() + ": after first");

    return "first";
  }, executorService).applyToEitherAsync(CompletableFuture.supplyAsync(() -> {
    System.out.println(Thread.currentThread().getName() + ": before second");
    try {
      Thread.currentThread().sleep(2000);
    } catch (InterruptedException e) {
    }
    System.out.println(Thread.currentThread().getName() + ": after second");

    return "second";
  }, executorService), (s) -> s);
  System.out.println("main over");
  String join = future.join();
  System.out.println(String.format("future result %s",join));
}
/*
main start
test1: before first
test2: before second
main over
test1: after first
future result first
test2: after second
*/
```

#### acceptEither

同理acceptEither

```java
public CompletionStage<Void> acceptEither(CompletionStage<? extends T> other,Consumer<? super T> action);
public CompletionStage<Void> acceptEitherAsync(CompletionStage<? extends T> other,Consumer<? super T> action);
public CompletionStage<Void> acceptEitherAsync(CompletionStage<? extends T> other,Consumer<? super T> action,Executor executor);
```

#### runAfterEither

同理runAfterEither，两个异步任务任意一个执行完毕就执行 runAfterEither 参数中的任务

```java
public CompletionStage<Void> runAfterEither(CompletionStage<?> other,Runnable action);
public CompletionStage<Void> runAfterEitherAsync(CompletionStage<?> other,Runnable action);
public CompletionStage<Void> runAfterEitherAsync(CompletionStage<?> other,Runnable action,Executor executor);
```

#### exceptionally

异常处理，当异步任务出现异常的时候处理方式,相当于 try-catch-finnaly中的catch，**可以调用程序指定的回调函数，通知外界执行异常**

```java
public CompletionStage<T> exceptionally(Function<Throwable, ? extends T> fn);
```

#### whenComplete

 try-catch-finnaly中的finnaly在返回结果前执行,接收两个参数，result和exception,一种是正常执行，返回值。另外一种是遇到异常抛出造成程序的中断，**可以调用程序指定的回调函数，通知外界执行完毕**

```java
public CompletionStage<T> whenComplete(BiConsumer<? super T, ? super Throwable> action);
public CompletionStage<T> whenCompleteAsync(BiConsumer<? super T, ? super Throwable> action);
public CompletionStage<T> whenCompleteAsync(BiConsumer<? super T, ? super Throwable> action,Executor executor);
```

```java
public static void main(String[] args) throws InterruptedException {
  System.out.println("main start");
  CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> {
    System.out.println(Thread.currentThread().getName() + ": before first");
    try {
      Thread.currentThread().sleep(1000);
    } catch (InterruptedException e) {
    }
    if(1 == 1) {
      throw new RuntimeException("fff");
    }
    System.out.println(Thread.currentThread().getName() + ": after first");
    return "first";
  }, executorService).exceptionally(e -> {
    System.out.println("异常："+e.getMessage());
    return "exception";
  }).whenComplete((r,e) -> {
    System.out.println("finnaly result:"+(r!=null?r:""));
    System.out.println("finnaly exception:"+(e!=null?e.getMessage():""));
  });
  System.out.println("main over");
  String join = future.join();
  System.out.println(String.format("future result %s",join));
}
/*
main start
test1: before first
main over
异常：java.lang.RuntimeException: fff
finnaly result:exception
finnaly exception:
future result exception
*/
```

#### handle

运行完成时，对结果的处理，跟whenComplete一样，不过调用该方法会有返回值。

```java
public <U> CompletionStage<U> handle(BiFunction<? super T, Throwable, ? extends U> fn);
public <U> CompletionStage<U> handleAsync(BiFunction<? super T, Throwable, ? extends U> fn);
public <U> CompletionStage<U> handleAsync(BiFunction<? super T, Throwable, ? extends U> fn,Executor executor);
```

#### allOf

等待一组异步任务都执行完毕

```java
public static void main(String[] args) throws InterruptedException {
  List<String> parameters = Lists.newArrayList("a","b","c","d");
  CompletableFuture[] futureList = parameters.stream().map(s -> CompletableFuture.supplyAsync(() -> {
    try {
      Thread.currentThread().sleep(1000L);
    } catch (InterruptedException e) {
      e.printStackTrace();
    }
    System.out.println(Thread.currentThread().getName() + "执行完毕:" + s);
    return s;
  },executorService)).toArray(CompletableFuture[]::new);
  System.out.println("main over");
  CompletableFuture<Void> voidCompletableFuture = CompletableFuture.allOf(futureList);
  Void join = voidCompletableFuture.join();
  System.out.println("all run over");
}
/*
main over
test1执行完毕:a
test2执行完毕:b
test1执行完毕:c
test2执行完毕:d
all run over
*/
```

#### anyOf

等待一组任意一个异步任务执行完毕