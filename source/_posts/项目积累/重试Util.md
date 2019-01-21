---
title: 重试Utils
date: 2019-01-20 19:12:30
tags:
- utils
categories:
- 项目积累
---

# 重试Utils

在项目中有很多这样的场景，调用一个接口，第一次调用失败，但是想重试几次，所以封装了一个这样的工具类，用于重试。同时在重试n次后失败，则调用callback处理。例如发送消息，重试几次，最后还是失败则记录失败消息记录表。

```java
import lombok.extern.slf4j.Slf4j;

import java.util.Optional;
import java.util.concurrent.TimeUnit;


@Slf4j
public class RetryUtil {
    /**
     * 功能描述: 重试执行一个任务
     *
     * @param: task 具体的任务
     * @param: maxCounts 重试最大次数
     * @param: sleepTime 重试时间间隔
     * @param: sleepTimeUnit 重试时间间隔单位
     * @param: taskDesc 任务描述
     * @param: failCallBack 任务重试失败回调接口
     * @return: 任务执行成功or失败
     * @auther: zhanglizhi
     */
    public static boolean runMaxTimes(Retriable task, int maxCounts, long sleepTime, TimeUnit sleepTimeUnit, String taskDesc, FailCallBack failCallBack) {
        int count = 0;
        while (count < maxCounts) {
            try {
                task.run();
                return true;
            } catch (Exception e) {
                log.error("{} 执行发生异常，{} {} 后重试第{}次", taskDesc, sleepTime, sleepTimeUnit.name(), (count + 1), e);
                try {
                    if (sleepTime > 0) {
                        sleepTimeUnit.sleep(sleepTime);
                    }
                } catch (InterruptedException e1) {
                    log.error("ReTryUtil.execMaxNTimes error!", e1);
                }
            } finally {
                count++;
            }
        }
        log.error("{}， 重试达到最大次数：{}， 放弃重试。 ", taskDesc, maxCounts);
        Optional.ofNullable(failCallBack).ifPresent(FailCallBack::callback);
        return false;
    }

    /**
     * 自定义任务接口
     *
     * @auther: zhanglizhi
     */
    public interface Retriable {
        void run() throws Exception;
    }

    /**
     * 功能描述: 任务失败回调接口
     *
     * @auther: zhanglizhi
     */
    public interface FailCallBack {
        void callback();
    }

}
```

测试

```java
public static void main(String[] args) {
    //传递一个一定会执行失败的任务
    boolean flag = RetryUtil.runMaxTimes(() -> {
        int i = 1 / 0;
    }, 3, 10, TimeUnit.MILLISECONDS, "测试任务", () -> {
        log.error("记录失败任务记录");
    });
    System.out.println(flag);
}
```

以上只是简单的封装，针对现有业务，其实还有很多可以扩展的地方，不过要看业务需求。例如

- 开启新线程跑重试任务
- 限制重试的时间，如果执行这个任务很耗时，重试3次时间太久了，可以在加一层总时间限制，当超过这个时间了，不管重试次数有没有达到，都算失败，防止阻塞主线程
- 带返回值的任务
- 业务执行失败的任务，比如调用接口返回的业务code是失败的， 进行重试

来看限制重试时间

```java
public static boolean runMaxTimes(Retriable task, int maxWaitTimes, String taskDesc, FailCallBack failCallBack) {
    int count = 0;
    long start = System.currentTimeMillis();
    long deadLine = start + maxWaitTimes;
    while (System.currentTimeMillis() < deadLine) {
        try {
            task.run();
            return true;
        } catch (Exception e) {
            log.error("{} 执行发生异常，执行次数,第{}次", taskDesc, (count + 1), e);
        } finally {
            count++;
        }
    }
    log.error("{}， 重试达到时间限制：{}， 放弃重试。 ", taskDesc, maxWaitTimes);
    Optional.ofNullable(failCallBack).ifPresent(FailCallBack::callback);
    return false;
}
```

任务带返回值

- 首先定义一个接口，提供返回值，实现类提供具体返回类型

```java
/**
 * 自定义任务接口
 *
 * @auther: zhanglizhi
 */
public interface RetryCallable<T> {
    T call() throws Exception;
}
```

- 调用返回任务的返回结果

```java
public static <T> T callMaxTimes(RetryCallable task, int maxWaitTimes, String taskDesc, FailCallBack failCallBack) {
    int count = 0;
    long start = System.currentTimeMillis();
    long deadLine = start + maxWaitTimes;
    while (System.currentTimeMillis() < deadLine) {
        try {
            Object call = task.call();
            return (T) call;
        } catch (Exception e) {
            log.error("{} 执行发生异常，执行次数,第{}次", taskDesc, (count + 1), e);
        } finally {
            count++;
        }
    }
    log.error("{}， 重试达到时间限制：{}， 放弃重试。 ", taskDesc, maxWaitTimes);
    Optional.ofNullable(failCallBack).ifPresent(FailCallBack::callback);
    return null;
}
```

- 测试

```java
public static void main(String[] args) {
    RetryCallable<Integer> retryCallable = new RetryCallable<Integer>() {
        @Override
        public Integer call() throws Exception {
            Thread.currentThread().sleep(1000);
            return 3;
        }
    };
    Integer value = RetryUtil.callMaxTimes(retryCallable, 3000, "测试任务", () -> {
        log.error("记录失败任务记录");
    });
    System.out.println(value);
}
```