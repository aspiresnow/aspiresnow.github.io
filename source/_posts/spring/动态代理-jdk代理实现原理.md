---
title: 动态代理-jdk代理实现原理
date: 2019-06-17 19:05:10
tags:
- aop
categories:
- spring


---

# 动态代理-jdk代理实现原理

JDK中提供了一个Proxy类用于实现动态代理，JDK的动态代理是基于接口实现的，被代理的对象要有实现的接口，会创建一个实现被代理类接口的代理类，因此只能代理接口中的方法

JDK中提供了一个Proxy类用于实现动态代理，JDK的动态代理是基于接口实现的，被代理的对象要有实现的接口，会创建一个实现被代理类接口的代理类，因此只能代理接口中的方法

## 使用

创建一个目标接口

```java
public interface IComputorService {
    //卖电脑
    void sellComputor(String brand);
    //修电脑
    void repairComputor(String brand);
}
```



被代理类

```java
class ThinkPadSeller implements IComputorService {
    public void sellComputor(String brand) {
        System.out.println("sell the thinkPad computor");
    }
    public void repairComputor(String brand) {
        System.out.println("repair the thinkPad computor");
    }
}
```

使用Proxy类的`newProxyInstance`方法创建代理代理类对象。`newProxyInstance`方法需要三个参数

- 第一个是ClassLoader类加载器，用于加载代理类，通常跟被代理类使用同一个ClassLoader。
- 第二个参数是一个Interface接口列表，代理就是要处理被代理类的方法，这个接口列表就是被代理类实现的接口。
- 第三个参数是一个InvocationHandler实现类，方法的代理操作就发生在这个实现类里。

```java
public static void main(String[] args) {
    IComputorService proxyInstance = (IComputorService) Proxy.newProxyInstance(ThinkPadSeller.class.getClassLoader(), new Class[]{IComputorService.class}, new InvocationHandler() {
        @Override
        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            System.out.println(String.format("proxy name:%s", proxy.getClass().getName()));
            System.out.println(String.format("method name:%s,args:%s", method.getName(), JSON.toJSONString(args)));
            return null;
        }
    });
    proxyInstance.repairComputor("联想");//使用代理类卖电脑
}
```

通过以上代码调试后可以看出，调用代理类所有的方法都会调InvocationHandler实现类的`invoke()`方法。前面说过动态代理需要调用被代理对象的方法，那么可以定义一个InvocationHandler的实现类，创建这个实现类对象时必须要传入一个被代理对象，在`invoke()`方法中调用被代理对象。

```java
class MyInvocationHandler implements InvocationHandler {
    //持有一个被代理对象
    private IComputorService computorService;
    public MyInvocationHandler(IComputorService computorService) {
        this.computorService = computorService;
    }
    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        System.out.println(String.format("proxy name:%s", proxy.getClass().getName()));
        System.out.println(String.format("method name:%s,args:%s", method.getName(), JSON.toJSONString(args)));
        //调用被代理对象 执行被代理对象逻辑
        Object obj = method.invoke(computorService, args);
        return obj;
    }
    //提供创建代理对象的方法
    public IComputorService getProxy() {
        return (IComputorService) Proxy.newProxyInstance(ThinkPadSeller.class.getClassLoader(), new Class[]{IComputorService.class}, this);
    }
}
```

### 源码分析

JDK创建代理就是调用Proxy的newProxyInstance方法，来看下这个方法内容

```java
public static Object newProxyInstance(ClassLoader loader, Class<?>[] interfaces,
                                      InvocationHandler h){
    Objects.requireNonNull(h);
	//
    final Class<?>[] intfs = interfaces.clone();
	//创建代理类 Class对象
    Class<?> cl = getProxyClass0(loader, intfs);
    //private static final Class<?>[] constructorParams = { InvocationHandler.class };
	final Constructor<?> cons = cl.getConstructor(constructorParams);
    final InvocationHandler ih = h;
    //使用构造器反射创建对象 InvocationHandler的实现类对象作为构造参数
    return cons.newInstance(new Object[]{h});
}
```

在这个方法中主要就是两步，首先通过getProxyClass0创建代理类Class对象，然后反射创建代理类对象。这个时候就需要看下代理类Class对象是什么东东了。通过ProxyGenerator类创建字节码然后写到本地来看

```java
public static void generateClassFile(Class clazz, String proxyName) throws IOException {
    //根据类信息和提供的代理类名称，生成字节码
    byte[] classFile = ProxyGenerator.generateProxyClass(proxyName, clazz.getInterfaces());
    String paths = clazz.getResource("/").getPath();
    System.out.println(paths);
    FileOutputStream out = null;
    out = new FileOutputStream(paths + proxyName + ".class");
    out.write(classFile);
    out.flush();
    out.close();
}
```

来看下生成的代理类Class

```java
public final class ThinkPadSellerProxy extends Proxy implements IComputorService {
    private static Method m1;
    private static Method m4;
    private static Method m3;
    private static Method m2;
    private static Method m0;

    public ThinkPadSellerProxy1(InvocationHandler var1) throws  {
        super(var1);
    }

    public final boolean equals(Object var1) throws  {
        try {
            return (Boolean)super.h.invoke(this, m1, new Object[]{var1});
        } catch (RuntimeException | Error var3) {
            throw var3;
        } catch (Throwable var4) {
            throw new UndeclaredThrowableException(var4);
        }
    }

    public final void sellComputor(String var1) throws  {
        try {//委托给InvocationHandler处理
            super.h.invoke(this, m4, new Object[]{var1});
        } catch (RuntimeException | Error var3) {
            throw var3;
        } catch (Throwable var4) {
            throw new UndeclaredThrowableException(var4);
        }
    }

    public final String repairComputor(String var1) throws  {
        try {//委托给InvocationHandler处理
            return (String)super.h.invoke(this, m3, new Object[]{var1});
        } catch (RuntimeException | Error var3) {
            throw var3;
        } catch (Throwable var4) {
            throw new UndeclaredThrowableException(var4);
        }
    }

    public final String toString() throws  {
        try {
            return (String)super.h.invoke(this, m2, (Object[])null);
        } catch (RuntimeException | Error var2) {
            throw var2;
        } catch (Throwable var3) {
            throw new UndeclaredThrowableException(var3);
        }
    }

    public final int hashCode() throws  {
        try {
            return (Integer)super.h.invoke(this, m0, (Object[])null);
        } catch (RuntimeException | Error var2) {
            throw var2;
        } catch (Throwable var3) {
            throw new UndeclaredThrowableException(var3);
        }
    }

    static {
        try {
            //反射通过获取接口中的所有方法 和Object中的方法
            m1 = Class.forName("java.lang.Object").getMethod("equals", Class.forName("java.lang.Object"));
            m4 = Class.forName("cn.zlz.proxy.IComputorService").getMethod("sellComputor", Class.forName("java.lang.String"));
            m3 = Class.forName("cn.zlz.proxy.IComputorService").getMethod("repairComputor", Class.forName("java.lang.String"));
            m2 = Class.forName("java.lang.Object").getMethod("toString");
            m0 = Class.forName("java.lang.Object").getMethod("hashCode");
        } catch (NoSuchMethodException var2) {
            throw new NoSuchMethodError(var2.getMessage());
        } catch (ClassNotFoundException var3) {
            throw new NoClassDefFoundError(var3.getMessage());
        }
    }
}
```

可以看到生成的代理类不仅实现了我们料想到的接口，同时也继承了Proxy类，在静态代码块中通过反射获取接口中的所有方法。

在通过Proxy创建代理类对象的时候使用其构造器反射创建，并传入了一个InvocationHandler的实现类对象。可以看到在这个代理类的构造器中直接调用了super(var1),那来看下父类Proxy构造器

```java
protected InvocationHandler h;
protected Proxy(InvocationHandler h) {
    Objects.requireNonNull(h);
    this.h = h;
}
```

在Proxy中就是就是给变量 h赋值了。

那再来看下这个代理类中对接口中方法的实现。可以看到的是只有一行代码，调用父类的中的InvocationHandler来处理方法的执行。而父类中的InvocationHandler对象就是在创建代理类时传入的。

```java
public final String repairComputor(String var1) throws  {
    return (String)super.h.invoke(this, m3, new Object[]{var1});
}
```

到这里我们基本就可以get到，JDK的动态代理就是先创建一个实现该接口的Class类，在这个Class类中反射获取接口中所有的方法，在实现接口方法中将对应的代理类对象、Method对象、method参数全委托给InvocationHandler来处理。所以只需要在定义的InvocationHandler实现类的invoke方法中针对不同的Method来写代理逻辑就行。

代理的时候需要调用被代理对象，所以可以在创建InvocationHandler对象的时候持有一个被代理对象，这样就可以在invoke方法中调用被代理对象原有的逻辑代码。

**通过生成的代理类和调用逻辑可以看到JDK代理特别依赖反射机制的，反射获取接口中所有的方法、反射创建代理对象、反射调用被代理对象的方法，所以JDK代理性能不会特别好。**