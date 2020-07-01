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

<!--more-->

## 知识导读

- Proxy提供了根据接口在运行时动态创建接口实现类和对象的功能，跟是否有被代理对象无关
- 使用Proxy动态创建类的时候，该类一定要有实现的接口
- Proxy动态创建的类会将所有方法的调用都委托给InvocationHandler对象的invoke方法来执行
- 可以在构造InvocationHandler对象的时候传递一个被代理类对象，在invoke方法中通过method反射调用被代理类对象的方法，在方法执行前后可以增加逻辑，也可以覆写，从而实现代理功能
- 分清代理类和代理类对象，生成的代理就一个，通过传递不同的参数InvocationHandler对象，创建不同的代理对象
- JDK的Proxy代理调用是基于Method反射来实现的，性能低于Cglib
- WeakCache 多级缓存的实现

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
public class ThinkPadSeller implements IComputorService {

    private String name;

    public ThinkPadSeller(String name) {
        this.name = name;
    }
    @Override
    public void sellComputor(String brand) {
        System.out.println("sell the thinkPad computor");
    }
    @Override
    public String repairComputor(String brand) {
        System.out.println("repair the thinkPad computor" + name);
        return brand;
    }
}
```

使用Proxy可以在运行时动态创建类和对象，在创建的时候需要指定类要实现的接口。

```java
public static void main(String[] args) throws IOException {
    //生成代理实现类
    System.setProperty("sun.misc.ProxyGenerator.saveGeneratedFiles", "true");
    InvocationHandler invocationHandler = new InvocationHandler() {
        @Override
        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            if (method.getName().equalsIgnoreCase("repairComputor")) {
                System.out.println("开始代理");
                System.out.println("调用代理类对象的repairComputor方法参数:" + JSON.toJSONString(args));
                //                    Object result = method.invoke(proxy, args);//会死循环，不要这样调
                System.out.println("结束代理");
                return "代理完了";
            }
            return null;
        }
    };
    //使用接口的类加载器
    Object o = Proxy.newProxyInstance(IComputorService.class.getClassLoader(), new Class[]{IComputorService.class}, invocationHandler);
    IComputorService proxy = IComputorService.class.cast(o);
    //com.sun.proxy.$Proxy0
    System.out.println("生成的代理实现类对象:" + proxy.getClass());
    String result = proxy.repairComputor("联想");
    System.out.println("调用代理实现类对象的repairComputor方法结果:" + result);
}
```

使用Proxy类的`newProxyInstance`方法创建代理代理类对象。`newProxyInstance`方法需要三个参数

- 第一个是ClassLoader类加载器，用于加载代理类，可以使用跟接口类的类加载器。
- 第二个参数是一个Interface接口列表，生成代理类要实现的接口。
- 第三个参数是一个InvocationHandler实现类，生成的代理类中所有方法的调用都会委托给这个InvocationHandler对象的invoke方法执行

代理类中所有方法的调用都会委托给参数InvocationHandler对象的invoke方法来执行，所以代理类所有方法的逻辑都需要在这个InvocationHandler对象中的invoke方法中来实现。

```java
public static void main(String[] args) throws IOException {
    System.setProperty("sun.misc.ProxyGenerator.saveGeneratedFiles", "true");
    ThinkPadSeller thinkPadSeller = new ThinkPadSeller("ThinkPad");
    //传入被代理类对象
    ComputorServiceProxyFactory computorServiceProxyFactory = new ComputorServiceProxyFactory(thinkPadSeller);
    //生成代理类对象
    IComputorService proxy = computorServiceProxyFactory.getProxy();
    proxy.repairComputor("联想");
}

//代理生成工厂 实现了InvocationHandler接口
static class ComputorServiceProxyFactory implements InvocationHandler {
    //持有一个被代理对象
    private IComputorService computorService;

    public ComputorServiceProxyFactory(IComputorService computorService) {
        this.computorService = computorService;
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        if (method.getName().equalsIgnoreCase("repairComputor")) {
            System.out.println("开始代理");
            //调用被代理对象 执行被代理对象逻辑
            Object obj = method.invoke(computorService, args);
            System.out.println("结束代理");
            return obj;
        } else {//其他方法调用被代理类对象的原有实现
            return method.invoke(computorService, args);
        }
    }
    //提供创建代理对象的方法
    public IComputorService getProxy() {
        return IComputorService.class.cast(Proxy.newProxyInstance(ThinkPadSeller.class.getClassLoader(), new Class[]{IComputorService.class}, this));
    }
}
```

如果要代理哪个对象，就可以在构造InvocationHandler对象的时候将被代理类对象作为参数传递过去，在invoke方法中可以调用被代理类对象的方法。

## 原理

Proxy在运行时动态创建Class类，该Class通过实现指定的接口，实现了接口中的方法，将方法逻辑的调用又委托给Proxy构造时传递的InvocationHandler对象，来看生成类 `com.sun.proxy.$Proxy0`

```java
public final class $Proxy0 extends Proxy implements IComputorService {
    private static Method m1;
    private static Method m4;
    private static Method m3;
    private static Method m2;
    private static Method m0;
	//构造器 传入InvocationHandler对象
    public $Proxy0(InvocationHandler var1) throws  {
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
        try {
            //调用InvocationHandler的invoke方法
            super.h.invoke(this, m4, new Object[]{var1});
        } catch (RuntimeException | Error var3) {
            throw var3;
        } catch (Throwable var4) {
            throw new UndeclaredThrowableException(var4);
        }
    }

    public final String repairComputor(String var1) throws  {
        try {
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
            m1 = Class.forName("java.lang.Object").getMethod("equals", Class.forName("java.lang.Object"));
            m4 = Class.forName("cn.zlz.proxy.jdk.IComputorService").getMethod("sellComputor", Class.forName("java.lang.String"));
            m3 = Class.forName("cn.zlz.proxy.jdk.IComputorService").getMethod("repairComputor", Class.forName("java.lang.String"));
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

h变量是定义在父类Proxy中的，就是InvocationHandler对象引用

```java
protected InvocationHandler h;
protected Proxy(InvocationHandler h) {
    Objects.requireNonNull(h);
    this.h = h;
}
```

生成的类很简单，继承了Proxy类，同时实现了我们创建该类时指定的接口，实现了接口中的所有可以实现的方法。在通过该类构造对象的时候需要传递InvocationHandler对象，类中所有的方法调用都委托给InvocationHandler对象来调用，将方法Method作为参数传递给InvocationHandler对象，那么调用的时候就看一使用反射Method来调用接口其他实现类对象的方法，从而实现代理的功能。

## 源码分析

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

在这个方法中主要就是两步，首先通过getProxyClass0创建代理类Class，然后指定InvocationHandler对象作为构造器参数反射创建代理类对象。首先来看下动态创建class的过程

```java
private static final WeakCache<ClassLoader, Class<?>[], Class<?>>
    proxyClassCache = new WeakCache<>(new KeyFactory(), new ProxyClassFactory());

private static Class<?> getProxyClass0(ClassLoader loader,
                                       Class<?>... interfaces) {
    if (interfaces.length > 65535) {
        throw new IllegalArgumentException("interface limit exceeded");
    }
    //使用到了缓存，如果指定的类加载和接口已经有了代理类直接返回
    return proxyClassCache.get(loader, interfaces);
}
```

通过cache这个命名能看出来，使用到了缓存，这里就是为了实现相同的类加载器和相同的接口列表只生成一个代理类，看过上面生成的代理类class代码可以看出来，相同的接口类是一样的，只是InvocationHandler对象不一样就可以，所以这里使用了缓存避免重复创建。

```java
public WeakCache(BiFunction<K, P, ?> subKeyFactory,
                 BiFunction<K, P, V> valueFactory) {
    this.subKeyFactory = Objects.requireNonNull(subKeyFactory);
    this.valueFactory = Objects.requireNonNull(valueFactory);
}

//获取缓存中的Class，如果有直接从缓存中拿，如果没有则创建并放入缓存
public V get(K key, P parameter) {
    Objects.requireNonNull(parameter);

    expungeStaleEntries();
	//一级缓存key使用  类加载器
    Object cacheKey = CacheKey.valueOf(key, refQueue);

    ConcurrentMap<Object, Supplier<V>> valuesMap = map.get(cacheKey);
    if (valuesMap == null) {
        ConcurrentMap<Object, Supplier<V>> oldValuesMap
            = map.putIfAbsent(cacheKey,
                              valuesMap = new ConcurrentHashMap<>());
        if (oldValuesMap != null) {
            valuesMap = oldValuesMap;
        }
    }
	//二级缓存key使用 接口列表 subKeyFactory由外部传入，用于生成二级缓存key
    Object subKey = Objects.requireNonNull(subKeyFactory.apply(key, parameter));
    //从缓存中获取生成的类
    Supplier<V> supplier = valuesMap.get(subKey);
    Factory factory = null;

    while (true) {
        //缓存中已经有生成的代理类，直接返回
        if (supplier != null) {
            V value = supplier.get();
            if (value != null) {
                return value;
            }
        }
       
        if (factory == null) {
            //创建factory，factory的get方法中创建代理类
            factory = new Factory(key, parameter, subKey, valuesMap);
        }

        if (supplier == null) {
            //将创建的factory对象放到二级缓存中，同时二级缓存是factory的一个属性
            supplier = valuesMap.putIfAbsent(subKey, factory);
            if (supplier == null) {
                supplier = factory;
            }
        } else {//多线程并发的时候 会替换缓存中的值
            if (valuesMap.replace(subKey, supplier, factory)) {
                supplier = factory;
            } else {
                supplier = valuesMap.get(subKey);
            }
        }
    }
}
```

调用factory的get方法，同步创建代理类，实际的创建逻辑是由外部传进来的valueFactory实现的，一种回调实现

```java
public synchronized V get() { // serialize access
    //锁内再次校验二级缓存中存放的是不是本线程放的对象
    Supplier<V> supplier = valuesMap.get(subKey);
    if (supplier != this) {
        //防止其他线程已经创建了，这里直接返回null，在外部的循环中会再次重试
        return null;
    }
    V value = null;
    try {//调用valueFactory创建代理类
        value = Objects.requireNonNull(valueFactory.apply(key, parameter));
    } finally {
        if (value == null) { //创建失败的话 从缓存中二级缓存中移除自己
            valuesMap.remove(subKey, this);
        }
    }
    //保证创阿金的class类不为空
    assert value != null;

    CacheValue<V> cacheValue = new CacheValue<>(value);
	//二级缓存中存储代理类
    if (valuesMap.replace(subKey, this, cacheValue)) {
        reverseMap.put(cacheValue, Boolean.TRUE);
    } else {
        throw new AssertionError("Should not reach here");
    }
    return value;
}
```

代理类class的创建实际还是在Proxy的内部类ProxyClassFactory创建的

```java
private static final class ProxyClassFactory
    implements BiFunction<ClassLoader, Class<?>[], Class<?>>
{
    // prefix for all proxy class names
    private static final String proxyClassNamePrefix = "$Proxy";

    // next number to use for generation of unique proxy class names
    private static final AtomicLong nextUniqueNumber = new AtomicLong();

    @Override
    public Class<?> apply(ClassLoader loader, Class<?>[] interfaces) {

        Map<Class<?>, Boolean> interfaceSet = new IdentityHashMap<>(interfaces.length);
        for (Class<?> intf : interfaces) {
            Class<?> interfaceClass = null;
            try {
                interfaceClass = Class.forName(intf.getName(), false, loader);
            } catch (ClassNotFoundException e) {
            }
            //验证当前接口 指定的类加载器可加载
            if (interfaceClass != intf) {
                throw new IllegalArgumentException(
                    intf + " is not visible from class loader");
            }
             //校验必须是接口
            if (!interfaceClass.isInterface()) {
                throw new IllegalArgumentException(
                    interfaceClass.getName() + " is not an interface");
            }
         、//防止接口重复
            if (interfaceSet.put(interfaceClass, Boolean.TRUE) != null) {
                throw new IllegalArgumentException(
                    "repeated interface: " + interfaceClass.getName());
            }
        }

        String proxyPkg = null;     // package to define proxy class in
        int accessFlags = Modifier.PUBLIC | Modifier.FINAL;
         //如果接口不是public的，需要生成跟接口是一个包下的代理类
        for (Class<?> intf : interfaces) {
            int flags = intf.getModifiers();
            if (!Modifier.isPublic(flags)) {
                accessFlags = Modifier.FINAL;
                String name = intf.getName();
                int n = name.lastIndexOf('.');
                String pkg = ((n == -1) ? "" : name.substring(0, n + 1));
                if (proxyPkg == null) {
                    proxyPkg = pkg;
                } else if (!pkg.equals(proxyPkg)) {
                    throw new IllegalArgumentException(
                        "non-public interfaces from different packages");
                }
            }
        }

        if (proxyPkg == null) {
            // if no non-public proxy interfaces, use com.sun.proxy package
            proxyPkg = ReflectUtil.PROXY_PACKAGE + ".";
        }
      	//代理类的名称为  xxxx$Proxy0,数字原子递增
        long num = nextUniqueNumber.getAndIncrement();
        String proxyName = proxyPkg + proxyClassNamePrefix + num;

       //调用ProxyGenerator生成代理类字节码
        byte[] proxyClassFile = ProxyGenerator.generateProxyClass(
            proxyName, interfaces, accessFlags);
        try {
        	//将Class字节码转换 通过类加载为Class对象
            return defineClass0(loader, proxyName,
                                proxyClassFile, 0, proxyClassFile.length);
        } catch (ClassFormatError e) {
            throw new IllegalArgumentException(e.toString());
        }
    }
}
```

接下来接着看ProxyGenerator生成class的过程，在这个方法中调用ProxyGenerator来生成字节码，然后可以通过设置一个系统变量将动态代理类生成文件。

```java
public static byte[] generateProxyClass(final String var0, Class<?>[] var1, int var2) {
    ProxyGenerator var3 = new ProxyGenerator(var0, var1, var2);
    final byte[] var4 = var3.generateClassFile();
    if (saveGeneratedFiles) {
        AccessController.doPrivileged(new PrivilegedAction<Void>() {
            public Void run() {
                try {
                    int var1 = var0.lastIndexOf(46);
                    Path var2;
                    if (var1 > 0) {
                        Path var3 = Paths.get(var0.substring(0, var1).replace('.', File.separatorChar));
                        Files.createDirectories(var3);
                        var2 = var3.resolve(var0.substring(var1 + 1, var0.length()) + ".class");
                    } else {
                        var2 = Paths.get(var0 + ".class");
                    }

                    Files.write(var2, var4, new OpenOption[0]);
                    return null;
                } catch (IOException var4x) {
                    throw new InternalError("I/O exception saving generated file: " + var4x);
                }
            }
        });
    }
    return var4;
}
```

实际的生成就是调用 ProxyGenerator.generateClassFile()方法生成的，这里就不展示了，字节码的生成感兴趣的可以自己看代码，最终通过这些步骤生成了Class代理类，在回到Proxy.newProxyInstance方法的Class<?> cl = getProxyClass0(loader, intfs);这时候已经获取到代理类，接下来就是通过构造器反射创建代理类对象

```java
if (sm != null) {
    checkNewProxyPermission(Reflection.getCallerClass(), cl);
}

final Constructor<?> cons = cl.getConstructor(constructorParams);
final InvocationHandler ih = h;
if (!Modifier.isPublic(cl.getModifiers())) {
    AccessController.doPrivileged(new PrivilegedAction<Void>() {
        public Void run() {
            cons.setAccessible(true);
            return null;
        }
    });
}
//调用构造器创建代理类对象，传入最重要的InvocationHandler对象
return cons.newInstance(new Object[]{h});
```

 