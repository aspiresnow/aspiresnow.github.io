---
title: spring-AOP 动态代理
date: 2018-12-20 15:05:10
tags:
- spring 
categories:
- spring


---

# spring-AOP 动态代理

有动态代理就有静态代理，静态代理就是创建一个代理类，持有一个被代理对象，然后再提供代理方法，供外界调用，在方法中调用相应的被代理类的方法，达到代理的效果。但是由于代理需要去写代理类，当需要很多代理的时候需要定义大量的代理类，所以就有了一个想法，能不能在运行期间去通过程序代码创建代理class类并创建代理对象。当代理对象不需要的时候销毁运行期间创建的代理类。动态代理模式就是做这个用的。

动态代理可以在运行期间按照java字节码规范创建.class文件格式的二进制数据，然后通过类加载器加载到虚拟机中，转换为对应的类，这样就完成了动态创建类的功能。生成二进制字节码的方法已经有很多开源框架提供，如ASM、Javassit、JDK代理的ProxyGenerator

**ASM** ：直接操作字节码指令，执行效率高，要是使用者掌握Java类字节码文件格式及指令，对使用者的要求比较高。

**Javassit** 提供了更高级的API，执行效率相对较差，但无需掌握字节码指令的知识，对使用者要求较低。

## JDK动态代理

JDK中提供了一个Proxy类用于实现动态代理，JDK的动态代理是基于接口实现的，被代理的对象要有实现的接口，会创建一个实现被代理类接口的代理类，因此只能代理接口中的方法

```java
interface IComputorService {
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
    String paths = clazz.getResource(".").getPath();
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

## Cglib代理

由于JDK代理，被代理类必须要实现接口，而且JDK代理严重依赖反射机制，性能比较差，所以就有了另外一种机制来解决这些问题。代理其实就是扩展，在java机制中可以通过提供接口的不同实现类来扩展，同样也可以提供子类来扩展和改变父类的功能。

没错，cglib就是通过创建一个被代理类的子类来实现代理的,在子类中重写父类的方法来扩展父类原有的功能。不过这样导致被代理类不能是`final`修饰的，被代理的方法只能是`非final`修饰的`public`方法。Cglib底层是使用ASM实现的

使用Cglib代理首先需要依赖Cglib的jar包

```xml
<dependency>
   <groupId>cglib</groupId>
   <artifactId>cglib</artifactId>
   <version>2.1_3</version>
</dependency>
```

```java
//创建一个增强器 Enhancer对象
Enhancer enhancer = new Enhancer();
//设置要创建动态代理的类,即父类
enhancer.setSuperclass(ThinkPadSeller.class);
// 设置回调，对代理类上所有方法的调用，都会调用CallBack，而Callback则需要实行intercept()方法进行拦截
enhancer.setCallback(new MethodInterceptor() {
    @Override
    public Object intercept(Object obj, Method method, Object[] args, MethodProxy proxy) throws Throwable {
        System.out.println("开始代理");
        //obj是代理类
        System.out.println(String.format("obj name:%s", obj.getClass().getName()));
        System.out.println(String.format("method name:%s,args:%s", method.getName(), JSON.toJSONString(args)));
        //代理类是继承的被代理类，调用父类的原方法
        Object o = proxy.invokeSuper(obj, args);//获取被代理类接口返回值
        System.out.println(String.format("被代理方法返回值:%s",o));
        System.out.println("结束代理");
        return o;            
    }
});
//创建代理类对象
ThinkPadSeller proxy = (ThinkPadSeller) enhancer.create();
//使用代理类对象调用方法
proxy.repairComputor("联想");
```

使用Cglib创建代理类，首先需要常见一个增强器Enhancer，然后指定父类，接着设置了一个MethodInterceptor的实现类。最后调用enhancer的create方法创建代理类对象。可以看到，跟JDK代理很像，这里是使用了MethodInterceptor。

在代码中添加一行配置可以将Cglib生成的代理类写下来

```java
System.setProperty(DebuggingClassWriter.DEBUG_LOCATION_PROPERTY, JdkProxy.class.getResource("/").getPath());
```

来看下Cglib生成的代理类Class

```java
public class ThinkPadSeller$$EnhancerByCGLIB$$13a549a5 extends ThinkPadSeller implements Factory {
    private boolean CGLIB$BOUND;
    private static final ThreadLocal CGLIB$THREAD_CALLBACKS;
    private static final Callback[] CGLIB$STATIC_CALLBACKS;
    private MethodInterceptor CGLIB$CALLBACK_0;
    private static final Method CGLIB$repairComputor$0$Method;
    private static final MethodProxy CGLIB$repairComputor$0$Proxy;
    private static final Object[] CGLIB$emptyArgs;
    private static final Method CGLIB$sellComputor$1$Method;
    private static final MethodProxy CGLIB$sellComputor$1$Proxy;
    private static final Method CGLIB$finalize$2$Method;
    private static final MethodProxy CGLIB$finalize$2$Proxy;
    private static final Method CGLIB$equals$3$Method;
    private static final MethodProxy CGLIB$equals$3$Proxy;
    private static final Method CGLIB$toString$4$Method;
    private static final MethodProxy CGLIB$toString$4$Proxy;
    private static final Method CGLIB$hashCode$5$Method;
    private static final MethodProxy CGLIB$hashCode$5$Proxy;
    private static final Method CGLIB$clone$6$Method;
    private static final MethodProxy CGLIB$clone$6$Proxy;

    static void CGLIB$STATICHOOK1() {
        CGLIB$THREAD_CALLBACKS = new ThreadLocal();
        Class var0;
        ClassLoader var10000 = (var0 = Class.forName("cn.zlz.proxy.ThinkPadSeller$$EnhancerByCGLIB$$13a549a5")).getClassLoader();
        CGLIB$emptyArgs = new Object[0];
        CGLIB$repairComputor$0$Proxy = MethodProxy.create(var10000, (CGLIB$repairComputor$0$Method = Class.forName("cn.zlz.proxy.ThinkPadSeller").getDeclaredMethod("repairComputor", Class.forName("java.lang.String"))).getDeclaringClass(), var0, "(Ljava/lang/String;)Ljava/lang/String;", "repairComputor", "CGLIB$repairComputor$0");
        CGLIB$sellComputor$1$Proxy = MethodProxy.create(var10000, (CGLIB$sellComputor$1$Method = Class.forName("cn.zlz.proxy.ThinkPadSeller").getDeclaredMethod("sellComputor", Class.forName("java.lang.String"))).getDeclaringClass(), var0, "(Ljava/lang/String;)V", "sellComputor", "CGLIB$sellComputor$1");
        CGLIB$finalize$2$Proxy = MethodProxy.create(var10000, (CGLIB$finalize$2$Method = Class.forName("java.lang.Object").getDeclaredMethod("finalize")).getDeclaringClass(), var0, "()V", "finalize", "CGLIB$finalize$2");
        CGLIB$equals$3$Proxy = MethodProxy.create(var10000, (CGLIB$equals$3$Method = Class.forName("java.lang.Object").getDeclaredMethod("equals", Class.forName("java.lang.Object"))).getDeclaringClass(), var0, "(Ljava/lang/Object;)Z", "equals", "CGLIB$equals$3");
        CGLIB$toString$4$Proxy = MethodProxy.create(var10000, (CGLIB$toString$4$Method = Class.forName("java.lang.Object").getDeclaredMethod("toString")).getDeclaringClass(), var0, "()Ljava/lang/String;", "toString", "CGLIB$toString$4");
        CGLIB$hashCode$5$Proxy = MethodProxy.create(var10000, (CGLIB$hashCode$5$Method = Class.forName("java.lang.Object").getDeclaredMethod("hashCode")).getDeclaringClass(), var0, "()I", "hashCode", "CGLIB$hashCode$5");
        CGLIB$clone$6$Proxy = MethodProxy.create(var10000, (CGLIB$clone$6$Method = Class.forName("java.lang.Object").getDeclaredMethod("clone")).getDeclaringClass(), var0, "()Ljava/lang/Object;", "clone", "CGLIB$clone$6");
    }

    final String CGLIB$repairComputor$0(String var1) {
        return super.repairComputor(var1);
    }

    public final String repairComputor(String var1) {
        MethodInterceptor var10000 = this.CGLIB$CALLBACK_0;
        if (this.CGLIB$CALLBACK_0 == null) {
            CGLIB$BIND_CALLBACKS(this);
            var10000 = this.CGLIB$CALLBACK_0;
        }

        return var10000 != null ? (String)var10000.intercept(this, CGLIB$repairComputor$0$Method, new Object[]{var1}, CGLIB$repairComputor$0$Proxy) : super.repairComputor(var1);
    }

    final void CGLIB$sellComputor$1(String var1) {
        super.sellComputor(var1);
    }

    public final void sellComputor(String var1) {
        MethodInterceptor var10000 = this.CGLIB$CALLBACK_0;
        if (this.CGLIB$CALLBACK_0 == null) {
            CGLIB$BIND_CALLBACKS(this);
            var10000 = this.CGLIB$CALLBACK_0;
        }

        if (var10000 != null) {
            var10000.intercept(this, CGLIB$sellComputor$1$Method, new Object[]{var1}, CGLIB$sellComputor$1$Proxy);
        } else {
            super.sellComputor(var1);
        }
    }

    final void CGLIB$finalize$2() throws Throwable {
        super.finalize();
    }

    protected final void finalize() throws Throwable {
        MethodInterceptor var10000 = this.CGLIB$CALLBACK_0;
        if (this.CGLIB$CALLBACK_0 == null) {
            CGLIB$BIND_CALLBACKS(this);
            var10000 = this.CGLIB$CALLBACK_0;
        }

        if (var10000 != null) {
            var10000.intercept(this, CGLIB$finalize$2$Method, CGLIB$emptyArgs, CGLIB$finalize$2$Proxy);
        } else {
            super.finalize();
        }
    }

    final boolean CGLIB$equals$3(Object var1) {
        return super.equals(var1);
    }

    public final boolean equals(Object var1) {
        MethodInterceptor var10000 = this.CGLIB$CALLBACK_0;
        if (this.CGLIB$CALLBACK_0 == null) {
            CGLIB$BIND_CALLBACKS(this);
            var10000 = this.CGLIB$CALLBACK_0;
        }

        if (var10000 != null) {
            Object var2 = var10000.intercept(this, CGLIB$equals$3$Method, new Object[]{var1}, CGLIB$equals$3$Proxy);
            return var2 == null ? false : (Boolean)var2;
        } else {
            return super.equals(var1);
        }
    }

    final String CGLIB$toString$4() {
        return super.toString();
    }

    public final String toString() {
        MethodInterceptor var10000 = this.CGLIB$CALLBACK_0;
        if (this.CGLIB$CALLBACK_0 == null) {
            CGLIB$BIND_CALLBACKS(this);
            var10000 = this.CGLIB$CALLBACK_0;
        }

        return var10000 != null ? (String)var10000.intercept(this, CGLIB$toString$4$Method, CGLIB$emptyArgs, CGLIB$toString$4$Proxy) : super.toString();
    }

    final int CGLIB$hashCode$5() {
        return super.hashCode();
    }

    public final int hashCode() {
        MethodInterceptor var10000 = this.CGLIB$CALLBACK_0;
        if (this.CGLIB$CALLBACK_0 == null) {
            CGLIB$BIND_CALLBACKS(this);
            var10000 = this.CGLIB$CALLBACK_0;
        }

        if (var10000 != null) {
            Object var1 = var10000.intercept(this, CGLIB$hashCode$5$Method, CGLIB$emptyArgs, CGLIB$hashCode$5$Proxy);
            return var1 == null ? 0 : ((Number)var1).intValue();
        } else {
            return super.hashCode();
        }
    }

    final Object CGLIB$clone$6() throws CloneNotSupportedException {
        return super.clone();
    }

    protected final Object clone() throws CloneNotSupportedException {
        MethodInterceptor var10000 = this.CGLIB$CALLBACK_0;
        if (this.CGLIB$CALLBACK_0 == null) {
            CGLIB$BIND_CALLBACKS(this);
            var10000 = this.CGLIB$CALLBACK_0;
        }

        return var10000 != null ? var10000.intercept(this, CGLIB$clone$6$Method, CGLIB$emptyArgs, CGLIB$clone$6$Proxy) : super.clone();
    }

    public static MethodProxy CGLIB$findMethodProxy(Signature var0) {
        String var10000 = var0.toString();
        switch(var10000.hashCode()) {
        case -1574182249:
            if (var10000.equals("finalize()V")) {
                return CGLIB$finalize$2$Proxy;
            }
            break;
        case -819357441:
            if (var10000.equals("repairComputor(Ljava/lang/String;)Ljava/lang/String;")) {
                return CGLIB$repairComputor$0$Proxy;
            }
            break;
        case -508378822:
            if (var10000.equals("clone()Ljava/lang/Object;")) {
                return CGLIB$clone$6$Proxy;
            }
            break;
        case 667760668:
            if (var10000.equals("sellComputor(Ljava/lang/String;)V")) {
                return CGLIB$sellComputor$1$Proxy;
            }
            break;
        case 1826985398:
            if (var10000.equals("equals(Ljava/lang/Object;)Z")) {
                return CGLIB$equals$3$Proxy;
            }
            break;
        case 1913648695:
            if (var10000.equals("toString()Ljava/lang/String;")) {
                return CGLIB$toString$4$Proxy;
            }
            break;
        case 1984935277:
            if (var10000.equals("hashCode()I")) {
                return CGLIB$hashCode$5$Proxy;
            }
        }

        return null;
    }

    public ThinkPadSeller$$EnhancerByCGLIB$$13a549a5() {
        CGLIB$BIND_CALLBACKS(this);
    }

    public static void CGLIB$SET_THREAD_CALLBACKS(Callback[] var0) {
        CGLIB$THREAD_CALLBACKS.set(var0);
    }

    public static void CGLIB$SET_STATIC_CALLBACKS(Callback[] var0) {
        CGLIB$STATIC_CALLBACKS = var0;
    }

    private static final void CGLIB$BIND_CALLBACKS(Object var0) {
        ThinkPadSeller$$EnhancerByCGLIB$$13a549a5 var1 = (ThinkPadSeller$$EnhancerByCGLIB$$13a549a5)var0;
        if (!var1.CGLIB$BOUND) {
            var1.CGLIB$BOUND = true;
            Object var10000 = CGLIB$THREAD_CALLBACKS.get();
            if (var10000 == null) {
                var10000 = CGLIB$STATIC_CALLBACKS;
                if (CGLIB$STATIC_CALLBACKS == null) {
                    return;
                }
            }
            var1.CGLIB$CALLBACK_0 = (MethodInterceptor)((Callback[])var10000)[0];
        }
    }
    public Object newInstance(Callback[] var1) {
        CGLIB$SET_THREAD_CALLBACKS(var1);
        ThinkPadSeller$$EnhancerByCGLIB$$13a549a5 var10000 = new ThinkPadSeller$$EnhancerByCGLIB$$13a549a5();
        CGLIB$SET_THREAD_CALLBACKS((Callback[])null);
        return var10000;
    }
    public Object newInstance(Callback var1) {
        CGLIB$SET_THREAD_CALLBACKS(new Callback[]{var1});
        ThinkPadSeller$$EnhancerByCGLIB$$13a549a5 var10000 = new ThinkPadSeller$$EnhancerByCGLIB$$13a549a5();
        CGLIB$SET_THREAD_CALLBACKS((Callback[])null);
        return var10000;
    }
    public Object newInstance(Class[] var1, Object[] var2, Callback[] var3) {
        CGLIB$SET_THREAD_CALLBACKS(var3);
        ThinkPadSeller$$EnhancerByCGLIB$$13a549a5 var10000 = new ThinkPadSeller$$EnhancerByCGLIB$$13a549a5;
        switch(var1.length) {
        case 0:
            var10000.<init>();
            CGLIB$SET_THREAD_CALLBACKS((Callback[])null);
            return var10000;
        default:
            throw new IllegalArgumentException("Constructor not found");
        }
    }
    public Callback getCallback(int var1) {
        CGLIB$BIND_CALLBACKS(this);
        MethodInterceptor var10000;
        switch(var1) {
        case 0:
            var10000 = this.CGLIB$CALLBACK_0;
            break;
        default:
            var10000 = null;
        }
        return var10000;
    }
    public void setCallback(int var1, Callback var2) {
        switch(var1) {
        case 0:
            this.CGLIB$CALLBACK_0 = (MethodInterceptor)var2;
        }
    }
    public Callback[] getCallbacks() {
        CGLIB$BIND_CALLBACKS(this);
        return new Callback[]{this.CGLIB$CALLBACK_0};
    }
    public void setCallbacks(Callback[] var1) {
        this.CGLIB$CALLBACK_0 = (MethodInterceptor)var1[0];
    }
    static {
        CGLIB$STATICHOOK1();
    }
}
```

在Cglib中，方法的调用并不是通过反射来完成的，而是直接对方法进行调用。FastClass对Class对象进行特别的处理，将所有的method方法都存入一个数组中，每次调用方法的时候都是通过一个index下标来保持对方法的引用。getIndex方法就是通过方法签名来湖里区方法的。