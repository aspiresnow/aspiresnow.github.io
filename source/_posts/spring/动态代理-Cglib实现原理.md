---
title: 动态代理-Cglib实现原理
date: 2019-06-17 19:05:10
tags:
- aop
categories:
- spring


---

# 动态代理-Cglib实现原理

Cglib提供了一种运行时动态增强类的功能。基于ASM在运行时动态创建class，暴露Callback接口用于对类和方法进行增强。通过Cglib不仅能够实现同JDK Proxy一样的基于接口和反射调用的增强类，同时也可以基于实现类对类进行增强，并且可以避免使用反射调用，而且使用了FastClass模式，运行效率要高于使用反射

<!--more-->

## 知识导读

- cglib是在运行时动态创建类的一种实现，可以对比目标类的行为进行**扩展**或者**覆盖**，不要局限于代理
- cglib对目标类的增强主要是在运行时生成目标类的子类实现的。调用的时候基于FastClass模式，避免反射
- cglib也可以同JDK proxy一样,创建基于接口实现的增强类，调用基于反射
- cglib动态增强生成子类的时候，目标类和目标方法不能是final修饰的
- 对方法的增强是通过Callback接口实现的，所以需要实现的逻辑都在这
- 使用Callback+CallbackFilter实现对不同方法实现不同的增强
- 最常用的Callback实现MethodInterceptor，理解每个参数的含义
- MethodProxy+FastClass实现原理

## 使用

创建一个非final的类，用于被增强

```java
public class MacBookSeller {

    private String name;

    public MacBookSeller(String name) {
        this.name = name;
    }
    public MacBookSeller() {
        this.name = "未知";
    }
    public void sellComputor(String brand) {
        System.out.println("sell the MacBook computor");
    }
    public String repairComputor(String brand) {
        System.out.println("repair the MacBook computor：" + name);
        return name;
    }
}
```

来看个使用cglib对MacBookSeller类进行增强的例子

```java
public static void main(String[] args) {
    //生成cglib生成的类
    System.setProperty(DebuggingClassWriter.DEBUG_LOCATION_PROPERTY, JdkProxy.class.getResource("/").getPath());
    //创建一个加强器 Enhancer对象
    Enhancer enhancer = new Enhancer();
    //设置要创建动态代理的类,即父类
    enhancer.setSuperclass(MacBookSeller.class);
    MacBookSeller macBookSeller = new MacBookSeller("苹果专卖店");
    // 设置回调，这里相当于是对于目标类上所有方法的调用，都会调用CallBack，而Callback则需要实行intercept()方法进行拦截
    enhancer.setCallback(new MethodInterceptor() {
        @Override
        public Object intercept(Object obj, Method method, Object[] args, MethodProxy proxy) throws Throwable {
            if (method.getName().equalsIgnoreCase("repairComputor")) {
                System.out.println("开始代理");
                System.out.println(String.format("method name:%s,args:%s", method.getName(), JSON.toJSONString(args)));
                //增强类继承的目标类，调用父类的原方法
                Object o = proxy.invokeSuper(obj, args);//通过增强类调用目标类方法，注意obj是增强类对象
                Object o1 = proxy.invoke(macBookSeller, args);//直接通过父类对象调用
                System.out.println("通过增强类对象调用父类方法结果:" + o);//输出的name是增强类的name
                System.out.println("通过目标类对象直接调用目标方法结果:" + o1);//输出的name是父类的name
                System.out.println("结束代理");
                return o;//调用增强类对象方法的返回值
            }
            return null;
        }
    });
    //创建代理类对象 指定构造器
    MacBookSeller proxy = MacBookSeller.class.cast(enhancer.create(new Class[]{String.class}, new String[]{"proxy"}));
    System.out.println("proxy对象:" + proxy.getClass().getName());//cn.zlz.proxy.cglib.MacBookSeller$$EnhancerByCGLIB$$9c2b1abb
    String result = proxy.repairComputor("mac book pro");
    System.out.println("调用增强类对象的repairComputor方法返回结果:" + result);
}
```

Enhancer类中也提供了静态方法可以直接创建增强类对象

```java
public static Object create(Class superclass, Class[] interfaces, CallbackFilter filter, Callback[] callbacks) {
    Enhancer e = new Enhancer();
    e.setSuperclass(superclass);
    e.setInterfaces(interfaces);
    e.setCallbackFilter(filter);
    e.setCallbacks(callbacks);
    return e.create();
}
```

当要增强类中的不同方法需要不同的增强处理，可以指定多个Callback实现，同时使用CallbackFilter来给不同的方法分配不同的Callback来进行增强

```java
public static void main(String[] args) {
    System.setProperty(DebuggingClassWriter.DEBUG_LOCATION_PROPERTY, JdkProxy.class.getResource("/").getPath());
    //创建一个加强器 Enhancer对象
    Enhancer enhancer = new Enhancer();
    //设置要创建动态代理的类,即父类
    enhancer.setSuperclass(MacBookSeller.class);
    MethodInterceptor methodInterceptor1 = new MethodInterceptor() {
        @Override
        public Object intercept(Object obj, Method method, Object[] args, MethodProxy proxy) throws Throwable {
            System.out.println("开始代理1");
            //代理类是继承的被代理类，调用父类的原方法
            Object o = proxy.invokeSuper(obj, args);
            System.out.println(String.format("被代理方法返回值0:%s", o));
            System.out.println("结束代理1");
            return o;
        }
    };
    MethodInterceptor methodInterceptor2 = new MethodInterceptor() {
        @Override
        public Object intercept(Object obj, Method method, Object[] args, MethodProxy proxy) throws Throwable {
            System.out.println("开始代理2");
            //代理类是继承的被代理类，调用父类的原方法
            Object o = proxy.invokeSuper(obj, args);
            System.out.println(String.format("被代理方法返回值0:%s", o));
            System.out.println("结束代理2");
            return o;
        }
    };

    // 设置回调，这里相当于是对于代理类上所有方法的调用，都会调用CallBack，而Callback则需要实行intercept()方法进行拦截
    Callback[] callbacks = {methodInterceptor1, methodInterceptor2, NoOp.INSTANCE};
    enhancer.setCallbacks(callbacks);
    //CallbackFilter对应Callbacks中的，用于指定方法使用哪个Callback
    CallbackFilter callbackFilter = new CallbackFilter() {
        @Override
        public int accept(Method method) {
            if (method.getName().equalsIgnoreCase("repairComputor")) {
                return 0;//使用数组中的一个 MethodInterceptor
            } else if (method.getName().equalsIgnoreCase("sellComputor")) {
                return 1;//使用Callback数组中的第二个  MethodInterceptor
            } else {
                return 2;//其他方法使用NoOp不进行任何增强
            }
        }
    };
    enhancer.setCallbackFilter(callbackFilter);
    MacBookSeller proxy = MacBookSeller.class.cast(Enhancer.create(MacBookSeller.class, null, callbackFilter, callbacks));
    proxy.repairComputor("mac book pro");
    proxy.sellComputor("mac book pro");
}
```

Cglib不仅可以基于实现类来进行增强，同时也可以实现JDK的代理，在Cglib中提供了一个InvocationHandler接口实现了Callback接口，通过设置一个InvocationHandler实现可以创建一个和JDK代理实现方式一样的增强类，调用是基于反射来实现的，来看下面例子

```java
public static void main(String[] args) {
        System.setProperty(DebuggingClassWriter.DEBUG_LOCATION_PROPERTY, JdkProxy.class.getResource("/").getPath());
        //创建一个加强器 Enhancer对象
        Enhancer enhancer = new Enhancer();
        //设置要创建动态代理接口
        enhancer.setInterfaces(new Class[]{IComputorService.class});
        Callback invocationHandler = new InvocationHandler() {
            @Override
            public Object invoke(Object proxy, Method method, Object[] args) throws InvocationTargetException, IllegalAccessException {
                System.out.println(proxy.getClass().getName());
                System.out.println("method:" + method.getName());
//                return method.invoke(proxy, args);
                boolean enhanced = Enhancer.isEnhanced(proxy.getClass());
                System.out.println("是否增强:"+enhanced);
                return null;
            }
        };
        enhancer.setCallbacks(new Callback[]{invocationHandler, NoOp.INSTANCE});
        enhancer.setCallbackFilter(new CallbackFilter() {
            @Override
            public int accept(Method method) {
                //invocationHandler只拦截repairComputor和sellComputor两个方法
                if(method.getName().equalsIgnoreCase("repairComputor") ||method.getName().equalsIgnoreCase("sellComputor")) {
                    return 0;
                }else {//使用NoOp不对其他方法进行增强
                    return 1;
                }
            }
        });
        //创建代理类对象
        IComputorService proxy = IComputorService.class.cast(enhancer.create());
        proxy.repairComputor("mac book pro");
    }
```

## 原理

cglib基于继承目标类创建子类进行增强的时候，会动态创建3个类，一个是通过Enhancer创建一个目标类的实现类，另外两个是通过MethodProxy创建的FastClass，分别对应增强前的目标类的FastClass和增强类的FastClass，FastClass用于基于索引访问对象的方法。首先来看动态生成的增强类

```java
public class MacBookSeller$$EnhancerByCGLIB$$b857906a extends MacBookSeller implements Factory {
    private boolean CGLIB$BOUND;
    //用于存储和线程绑定 Callback
    private static final ThreadLocal CGLIB$THREAD_CALLBACKS;
    //Callback 用于对方法进行增强
    private static final Callback[] CGLIB$STATIC_CALLBACKS;
    //因为在生成的时候传递了3个Callback，所有会有3个
    private MethodInterceptor CGLIB$CALLBACK_0;
    private MethodInterceptor CGLIB$CALLBACK_1;
    private NoOp CGLIB$CALLBACK_2;
    private static final Method CGLIB$repairComputor$0$Method;
    //对应 repairComputor 的MethodProxy
    private static final MethodProxy CGLIB$repairComputor$0$Proxy;
    private static final Object[] CGLIB$emptyArgs;
    private static final Method CGLIB$sellComputor$1$Method;
     //对应 sellComputor 的MethodProxy
    private static final MethodProxy CGLIB$sellComputor$1$Proxy;

    static void CGLIB$STATICHOOK1() {
        CGLIB$THREAD_CALLBACKS = new ThreadLocal();
        Class var0;
        ClassLoader var10000 = (var0 = Class.forName("cn.zlz.proxy.cglib.MacBookSeller$$EnhancerByCGLIB$$b857906a")).getClassLoader();
        CGLIB$emptyArgs = new Object[0];
        //创建MethodProxy
        CGLIB$repairComputor$0$Proxy = MethodProxy.create(var10000, (CGLIB$repairComputor$0$Method = Class.forName("cn.zlz.proxy.cglib.MacBookSeller").getDeclaredMethod("repairComputor", Class.forName("java.lang.String"))).getDeclaringClass(), var0, "(Ljava/lang/String;)Ljava/lang/String;", "repairComputor", "CGLIB$repairComputor$0");
       //创建MethodProxy
        CGLIB$sellComputor$1$Proxy = MethodProxy.create(var10000, (CGLIB$sellComputor$1$Method = Class.forName("cn.zlz.proxy.cglib.MacBookSeller").getDeclaredMethod("sellComputor", Class.forName("java.lang.String"))).getDeclaringClass(), var0, "(Ljava/lang/String;)V", "sellComputor", "CGLIB$sellComputor$1");
    }

    final String CGLIB$repairComputor$0(String var1) {
        //使用子类对象调用父类方法
        return super.repairComputor(var1);
    }

    //调用增强后的方法
    public final String repairComputor(String var1) {
        MethodInterceptor var10000 = this.CGLIB$CALLBACK_0;
        if (var10000 == null) {
            CGLIB$BIND_CALLBACKS(this);
            var10000 = this.CGLIB$CALLBACK_0;
        }
		//调用Callback的的人实现
        return var10000 != null ? (String)var10000.intercept(this, CGLIB$repairComputor$0$Method, new Object[]{var1}, CGLIB$repairComputor$0$Proxy) : super.repairComputor(var1);
    }

    final void CGLIB$sellComputor$1(String var1) {
        super.sellComputor(var1);
    }

    public final void sellComputor(String var1) {
        MethodInterceptor var10000 = this.CGLIB$CALLBACK_1;
        if (var10000 == null) {
            CGLIB$BIND_CALLBACKS(this);
            var10000 = this.CGLIB$CALLBACK_1;
        }

        if (var10000 != null) {
            var10000.intercept(this, CGLIB$sellComputor$1$Method, new Object[]{var1}, CGLIB$sellComputor$1$Proxy);
        } else {
            super.sellComputor(var1);
        }
    }

    public static MethodProxy CGLIB$findMethodProxy(Signature var0) {
        String var10000 = var0.toString();
        switch(var10000.hashCode()) {
        case -819357441:
            if (var10000.equals("repairComputor(Ljava/lang/String;)Ljava/lang/String;")) {
                return CGLIB$repairComputor$0$Proxy;
            }
            break;
        case 667760668:
            if (var10000.equals("sellComputor(Ljava/lang/String;)V")) {
                return CGLIB$sellComputor$1$Proxy;
            }
        }
        return null;
    }

    public MacBookSeller$$EnhancerByCGLIB$$b857906a(String var1) {
        super(var1);
        CGLIB$BIND_CALLBACKS(this);
    }

    public MacBookSeller$$EnhancerByCGLIB$$b857906a() {
        CGLIB$BIND_CALLBACKS(this);
    }

    public static void CGLIB$SET_THREAD_CALLBACKS(Callback[] var0) {
        CGLIB$THREAD_CALLBACKS.set(var0);
    }

    public static void CGLIB$SET_STATIC_CALLBACKS(Callback[] var0) {
        CGLIB$STATIC_CALLBACKS = var0;
    }

    private static final void CGLIB$BIND_CALLBACKS(Object var0) {
        MacBookSeller$$EnhancerByCGLIB$$b857906a var1 = (MacBookSeller$$EnhancerByCGLIB$$b857906a)var0;
        if (!var1.CGLIB$BOUND) {
            var1.CGLIB$BOUND = true;
            Object var10000 = CGLIB$THREAD_CALLBACKS.get();
            if (var10000 == null) {
                var10000 = CGLIB$STATIC_CALLBACKS;
                if (var10000 == null) {
                    return;
                }
            }

            Callback[] var10001 = (Callback[])var10000;
            var1.CGLIB$CALLBACK_2 = (NoOp)((Callback[])var10000)[2];
            var1.CGLIB$CALLBACK_1 = (MethodInterceptor)var10001[1];
            var1.CGLIB$CALLBACK_0 = (MethodInterceptor)var10001[0];
        }

    }

    public Object newInstance(Callback[] var1) {
        CGLIB$SET_THREAD_CALLBACKS(var1);
        MacBookSeller$$EnhancerByCGLIB$$b857906a var10000 = new MacBookSeller$$EnhancerByCGLIB$$b857906a();
        CGLIB$SET_THREAD_CALLBACKS((Callback[])null);
        return var10000;
    }

    public Object newInstance(Callback var1) {
        throw new IllegalStateException("More than one callback object required");
    }
	//创建对象的时候要传入 Callback
    public Object newInstance(Class[] var1, Object[] var2, Callback[] var3) {
        CGLIB$SET_THREAD_CALLBACKS(var3);
        MacBookSeller$$EnhancerByCGLIB$$b857906a var10000 = new MacBookSeller$$EnhancerByCGLIB$$b857906a;
        //基于CallbackFilter配置来生成的不同方法设置不同的Callback
        switch(var1.length) {
        case 0:
            var10000.<init>();
            break;
        case 1:
            if (var1[0].getName().equals("java.lang.String")) {
                var10000.<init>((String)var2[0]);
                break;
            }

            throw new IllegalArgumentException("Constructor not found");
        default:
            throw new IllegalArgumentException("Constructor not found");
        }

        CGLIB$SET_THREAD_CALLBACKS((Callback[])null);
        return var10000;
    }

    public Callback getCallback(int var1) {
        CGLIB$BIND_CALLBACKS(this);
        Object var10000;
        //基于CallbackFilter配置来生成的不同方法设置不同的Callback
        switch(var1) {
        case 0:
            var10000 = this.CGLIB$CALLBACK_0;
            break;
        case 1:
            var10000 = this.CGLIB$CALLBACK_1;
            break;
        case 2:
            var10000 = this.CGLIB$CALLBACK_2;
            break;
        default:
            var10000 = null;
        }

        return (Callback)var10000;
    }

    public void setCallback(int var1, Callback var2) {
        switch(var1) {
        case 0:
            this.CGLIB$CALLBACK_0 = (MethodInterceptor)var2;
            break;
        case 1:
            this.CGLIB$CALLBACK_1 = (MethodInterceptor)var2;
            break;
        case 2:
            this.CGLIB$CALLBACK_2 = (NoOp)var2;
        }

    }

    public Callback[] getCallbacks() {
        CGLIB$BIND_CALLBACKS(this);
        return new Callback[]{this.CGLIB$CALLBACK_0, this.CGLIB$CALLBACK_1, this.CGLIB$CALLBACK_2};
    }

    public void setCallbacks(Callback[] var1) {
        this.CGLIB$CALLBACK_0 = (MethodInterceptor)var1[0];
        this.CGLIB$CALLBACK_1 = (MethodInterceptor)var1[1];
        this.CGLIB$CALLBACK_2 = (NoOp)var1[2];
    }

    static {
        CGLIB$STATICHOOK1();
    }
}
```

通过生成的增强类可以分析以下几点

- 分清增强类和增强类对象，基于增强类可以创建很多对象，每个对象可以设置不同的Callback实现
- 在创建增强类对象的时候，一定要传递Callback实现，用于对方法进行增强
- 在增强类对象中可以使用增强类对象调用目标类对象
- 对方法的增强其实就是调用Callback实现类的方法，所以要对方法进行增强，就是在Callback实现类中写增强逻辑
- 对于每个要增强的方法都创建了一个MethodProxy对象，在调用Callback的实现的增强方法时将这个方法的MethodProxy对象传递过去，对于FastClass模式调用就是基于MethodProxy实现的

接下来看生成的FastClass，我们只看一个对应目标类的FastClass就可以，对应增强类的FastClass实现是类似的

```java
public class MacBookSeller$$FastClassByCGLIB$$f1fe2621 extends FastClass {
    public MacBookSeller$$FastClassByCGLIB$$f1fe2621(Class var1) {
        super(var1);
    }

    public int getIndex(Signature var1) {
        String var10000 = var1.toString();
        switch(var10000.hashCode()) {
        case -1725733088:
            if (var10000.equals("getClass()Ljava/lang/Class;")) {
                return 8;
            }
            break;
        case -1026001249:
            if (var10000.equals("wait(JI)V")) {
                return 3;
            }
            break;
        case -819357441:
            if (var10000.equals("repairComputor(Ljava/lang/String;)Ljava/lang/String;")) {
                return 0;
            }
            break;
        case 243996900:
            if (var10000.equals("wait(J)V")) {
                return 4;
            }
            break;
        case 667760668:
            if (var10000.equals("sellComputor(Ljava/lang/String;)V")) {
                return 1;
            }
            break;
        case 946854621:
            if (var10000.equals("notifyAll()V")) {
                return 10;
            }
            break;
        case 1116248544:
            if (var10000.equals("wait()V")) {
                return 2;
            }
            break;
        case 1826985398:
            if (var10000.equals("equals(Ljava/lang/Object;)Z")) {
                return 5;
            }
            break;
        case 1902039948:
            if (var10000.equals("notify()V")) {
                return 9;
            }
            break;
        case 1913648695:
            if (var10000.equals("toString()Ljava/lang/String;")) {
                return 6;
            }
            break;
        case 1984935277:
            if (var10000.equals("hashCode()I")) {
                return 7;
            }
        }

        return -1;
    }

    public int getIndex(String var1, Class[] var2) {
        switch(var1.hashCode()) {
        case -1886247170:
            if (var1.equals("repairComputor")) {
                switch(var2.length) {
                case 1:
                    if (var2[0].getName().equals("java.lang.String")) {
                        return 0;
                    }
                }
            }
            break;
        case -1776922004:
            if (var1.equals("toString")) {
                switch(var2.length) {
                case 0:
                    return 6;
                }
            }
            break;
        case -1358544445:
            if (var1.equals("sellComputor")) {
                switch(var2.length) {
                case 1:
                    if (var2[0].getName().equals("java.lang.String")) {
                        return 1;
                    }
                }
            }
            break;
        case -1295482945:
            if (var1.equals("equals")) {
                switch(var2.length) {
                case 1:
                    if (var2[0].getName().equals("java.lang.Object")) {
                        return 5;
                    }
                }
            }
            break;
        case -1039689911:
            if (var1.equals("notify")) {
                switch(var2.length) {
                case 0:
                    return 9;
                }
            }
            break;
        case 3641717:
            if (var1.equals("wait")) {
                switch(var2.length) {
                case 0:
                    return 2;
                case 1:
                    if (var2[0].getName().equals("long")) {
                        return 4;
                    }
                    break;
                case 2:
                    if (var2[0].getName().equals("long") && var2[1].getName().equals("int")) {
                        return 3;
                    }
                }
            }
            break;
        case 147696667:
            if (var1.equals("hashCode")) {
                switch(var2.length) {
                case 0:
                    return 7;
                }
            }
            break;
        case 1902066072:
            if (var1.equals("notifyAll")) {
                switch(var2.length) {
                case 0:
                    return 10;
                }
            }
            break;
        case 1950568386:
            if (var1.equals("getClass")) {
                switch(var2.length) {
                case 0:
                    return 8;
                }
            }
        }

        return -1;
    }

    public int getIndex(Class[] var1) {
        switch(var1.length) {
        case 0:
            return 1;
        case 1:
            if (var1[0].getName().equals("java.lang.String")) {
                return 0;
            }
        default:
            return -1;
        }
    }
	//通过不同的索引index来找到具体哪个方法的调用，避免了反射调用
    public Object invoke(int var1, Object var2, Object[] var3) throws InvocationTargetException {
        MacBookSeller var10000 = (MacBookSeller)var2;
        int var10001 = var1;

        try {
            switch(var10001) {
            case 0:
                return var10000.repairComputor((String)var3[0]);
            case 1:
                var10000.sellComputor((String)var3[0]);
                return null;
            case 2:
                var10000.wait();
                return null;
            case 3:
                var10000.wait(((Number)var3[0]).longValue(), ((Number)var3[1]).intValue());
                return null;
            case 4:
                var10000.wait(((Number)var3[0]).longValue());
                return null;
            case 5:
                return new Boolean(var10000.equals(var3[0]));
            case 6:
                return var10000.toString();
            case 7:
                return new Integer(var10000.hashCode());
            case 8:
                return var10000.getClass();
            case 9:
                var10000.notify();
                return null;
            case 10:
                var10000.notifyAll();
                return null;
            }
        } catch (Throwable var4) {
            throw new InvocationTargetException(var4);
        }

        throw new IllegalArgumentException("Cannot find matching method/constructor");
    }

    public Object newInstance(int var1, Object[] var2) throws InvocationTargetException {
        MacBookSeller var10000 = new MacBookSeller;
        MacBookSeller var10001 = var10000;
        int var10002 = var1;

        try {
            switch(var10002) {
            case 0:
                var10001.<init>((String)var2[0]);
                return var10000;
            case 1:
                var10001.<init>();
                return var10000;
            }
        } catch (Throwable var3) {
            throw new InvocationTargetException(var3);
        }

        throw new IllegalArgumentException("Cannot find matching method/constructor");
    }

    public int getMaxIndex() {
        return 10;
    }
}
```

主要来看invoke方法，在该方法中建立了目标类方法和index的对应关系。这样在调用的时候直接使用index就可以查找到调用哪个方法，避免了反射调用。

再来看下是在哪使用FastClass的invoke方法的，来看下MethodProxy的实现，每个方法都会创建一个MethodProxy对象，在MethodProxy对象中会分别保存对应目标类的FastClass对象和该方法对应的index，和对应增强类的FastClass对象和该方法对应的index，通过调用FastClass的invoke方法实现对方法的调用

```java
public class MethodProxy {
    private Signature sig;
    private String superName;//父类名称，也就是增强前类的名称
    private FastClass f1;//增强前类对应生成的FastClass对象
    private FastClass f2;//增强后类对应生成的FastClass对象
    private int i1;//增强前类的某方法在FastIndex中的索引
    private int i2;//增强后类的某方法在FastIndex中的索引

//CGLIB$repairComputor$0$Proxy = MethodProxy.create(var10000, Class.forName("cn.zlz.proxy.cglib.MacBookSeller"),  Class.forName("cn.zlz.proxy.cglib.MacBookSeller$$EnhancerByCGLIB$$4780b236"), "(Ljava/lang/String;)Ljava/lang/String;", "repairComputor", "CGLIB$repairComputor$0");

    public static MethodProxy create(ClassLoader loader, Class c1, Class c2, String desc, String name1, String name2) {
        final Signature sig1 = new Signature(name1, desc);
        Signature sig2 = new Signature(name2, desc);
        FastClass f1 = helper(loader, c1);//生成增强前类的FastClass并创建对象
        FastClass f2 = helper(loader, c2);//生成增强后类的FastClass并创建对象
        int i1 = f1.getIndex(sig1);//获取增强前方法的索引
        int i2 = f2.getIndex(sig2);//获取增强后方法的索引
        MethodProxy proxy;
        if (i1 < 0) {
            proxy = new MethodProxy() {
                public Object invoke(Object obj, Object[] args) throws Throwable {
                    throw new IllegalArgumentException("Protected method: " + sig1);
                }
            };
        } else {
            proxy = new MethodProxy();
        }
        proxy.f1 = f1;
        proxy.f2 = f2;
        proxy.i1 = i1;
        proxy.i2 = i2;
        proxy.sig = sig1;
        proxy.superName = name2;
        return proxy;
    }
}
```

 调用目标类的方法,调用FastClass对象的invoke方法，通过索引找到具体的方法

  ```java
  public Object invoke(Object obj, Object[] args) throws Throwable {
      try {
          return f1.invoke(i1, obj, args);
      } catch (InvocationTargetException e) {
          throw e.getTargetException();
      }
  }
  ```

  调用增强类的方法,调用FastClass对象的invoke方法，通过索引找到具体的方法

  ```java
  public Object invokeSuper(Object obj, Object[] args) throws Throwable {
      try {
          return f2.invoke(i2, obj, args);
      } catch (InvocationTargetException e) {
          throw e.getTargetException();
      }
  }
  ```

## 源码

简单了解下cglib增强类的实现

### Callback接口

- 首先认识一下Callback接口，这是cglib中很重要的一个接口，用于实现对方法增强的拦截接口。在增强的时候可以传递多个Callback实现类对象，不过一个方法最多应用一个Callback进行增强。不同的方法可以使用不同的Callback实现类来进行增强，这个要结合CallbackFilter来实现

  ```java
   /** @see MethodInterceptor NoOp LazyLoader Dispatcher InvocationHandler FixedValue*/  
  public interface Callback{}
  ```

- 来看`Callback`的一个实现接口`MethodInterceptor`,也是最常用的。

  ```java
  public interface MethodInterceptor extends Callback { 
      /**
      * @param obj "this"：增强后的类对象
      * @param method： 被拦截的方法，增强前的对象的方法，通过这个method可以用反射调用原方法
      * @param args: 调用方法时传递的参数
      * @param proxy: 可以用来调用原方法，也可以调用增强后的方法，使用fastClass模式调用(更快)
      */
      public Object intercept(Object obj, java.lang.reflect.Method method, Object[] args,
                                 MethodProxy proxy) throws Throwable;
  }
  ```
  
  - 当调用增强类方法的时候会转来调用`intercept`方法，在该方法中可以调用目标类(父类)的方法，也可以重写逻辑
  - 通过`method`可以用反射的方法调用增强类的方法，然后间接调用目标类的方法，不过这种方式不推荐，可以使用 `proxy.invokeSuper()`,避免反射。
  
- cglib也可以实现基于jdk的代理，通过实现cglib中的InvocationHandler。实现方式与JDK的proxy一样，都是基于Method反射做的 

  ```java
  public interface InvocationHandler extends Callback{
  	public Object invoke(Object proxy, Method method, Object[] args) throws Throwable;
  }
  ```

- 如果对方法不做任何拦截， cglib提供了 一个 `NoOp`的实现类

  ```java
  public interface NoOp extends Callback
  {
      public static final NoOp INSTANCE = new NoOp() { };
  }
  ```

### CallbackFilter接口

- 一个Callback会作用到类的所有方法，有时候不同的方法使用不同的增强Callback，这时就可以使用CallbackFilter来控制。在accept方法中返回的数字要严格对应Callback[]数组中对应下标的Callback实现类对象。

  ```java
  enhancer.setCallbacks(new Callback[]{methodInterceptor1, methodInterceptor2, NoOp.INSTANCE});
  CallbackFilter callbackFilter = new CallbackFilter() {
      @Override
      public int accept(Method method) {
          //严格对应Callbacks数组中的下标Callback
          if(method.getName().equalsIgnoreCase("repairComputor")) {
              return 0;//使用数组中的一个 MethodInterceptor
          }else if(method.getName().equalsIgnoreCase("sellComputor")){
              return 1;
          }else{
              return 2;
          }
      }
  };
  enhancer.setCallbackFilter(callbackFilter);
  ```

## Factory接口

- cglib生成的增强类都实现了`Factory`接口，通过接口中的newInstance方法创建对象会比较快，不需要反射。通过接口提供的方法可以看出要创建一个增强类对象必须要传递Callback对象作为参数,用于对方法进行增强

  ```java
  public interface Factory {
      Object newInstance(Callback callback);    
      Object newInstance(Callback[] callbacks);
      Object newInstance(Class[] types, Object[] args, Callback[] callbacks);
      Callback getCallback(int index);
      void setCallback(int index, Callback callback);
      void setCallbacks(Callback[] callbacks);  
      Callback[] getCallbacks();
  }
  ```

### Enhancer类

Enhancer类是cglib提供增强功能的入口类，通过该类可以在运行时动态创建增强类或者增强类对象

- 判断类是否是用Cglib增强后的类，注意，由于cglib也可增强基于接口实现的类，所以如果使用cglib的invocationHandler增强后的类通过isEnhanced返回的也是true

  ```java
  public static boolean isEnhanced(Class type) {
      try {
          getCallbacksSetter(type, SET_THREAD_CALLBACKS_NAME);
          return true;
      } catch (NoSuchMethodException e) {
          return false;
      }
  }
  ```

- 调用create方法进入增强类对象的创建流程，在该方法中调用createHelper方法

  ```java
  //基于无参构造器创建增强类对象
  public Object create() {
      classOnly = false;
      argumentTypes = null;
      return createHelper();
  }
  //基于有参构造器创建增强类对象
  public Object create(Class[] argumentTypes, Object[] arguments) {
          classOnly = false;
          if (argumentTypes == null || arguments == null || argumentTypes.length != arguments.length) {
              throw new IllegalArgumentException("Arguments must be non-null and of equal length");
          }
          this.argumentTypes = argumentTypes;
          this.arguments = arguments;
          return createHelper();
      }
  ```

- 在createHelper方法中进行了参数校验，然后设置包名，然后调用父类的create的方法创建增强类对象，注意传入了一个cacheKey，用于避免重复创建class，当cacheKey一样的时候，直接取缓存中的增强类来创建对象

  ```java
  private Object createHelper() {
      validate();
      if (superclass != null) {//包名
          setNamePrefix(superclass.getName());
      } else if (interfaces != null) {
          setNamePrefix(interfaces[ReflectUtils.findPackageProtected(interfaces)].getName());
      }
      return super.create(KEY_FACTORY.newInstance((superclass != null) ? superclass.getName() : null, ReflectUtils.getNames(interfaces),filter,callbackTypes,useFactory,
  interceptDuringConstruction, serialVersionUID));
  }
  ```
  

- 在父类的create方法中完成了增强类对象。为了避免重复创建相同的增强类，使用到了缓存。使用strategy生成增强类字节码，使用的是ASM实现的，这里就不详细展示生成过程了。

  ```java
  protected Object create(Object key) {
      try {
         Class gen = null;
         
          synchronized (source) {
              ClassLoader loader = getClassLoader();
              Map cache2 = null;
              cache2 = (Map)source.cache.get(loader);
              if (cache2 == null) {
                  cache2 = new HashMap();
                  cache2.put(NAME_KEY, new HashSet());
                  source.cache.put(loader, cache2);
              } else if (useCache) {
                  //从缓存中获取增强类
                  Reference ref = (Reference)cache2.get(key);
                  gen = (Class) (( ref == null ) ? null : ref.get()); 
              }
              if (gen == null) {
                  Object save = CURRENT.get();
                  CURRENT.set(this);
                  try {
                      this.key = key;
                      
                      if (attemptLoad) {
                          try {//用类加载尝试从虚拟机中加载增强类字节码，如果生成过就不用再创建
                              gen = loader.loadClass(getClassName());
                          } catch (ClassNotFoundException e) {
                              // ignore
                          }
                      }
                      if (gen == null) {
                          //调用strategy生成字节码
                          byte[] b = strategy.generate(this);
                          String className = ClassNameReader.getClassName(new ClassReader(b));
                          getClassNameCache(loader).add(className);
                          gen = ReflectUtils.defineClass(className, b, loader);
                      }
                     
                      if (useCache) {
                          //将生成的增强类添加到缓存中
                          cache2.put(key, new WeakReference(gen));
                      }
                      //创建增强类对象
                      return firstInstance(gen);
                  } finally {
                      CURRENT.set(save);
                  }
              }
          }
          return firstInstance(gen);
      } catch (RuntimeException e) {
          throw e;
      } catch (Error e) {
          throw e;
      } catch (Exception e) {
          throw new CodeGenerationException(e);
      }
  }
  ```

- 在创建完增强类之后，就是创建对象的过程，设置classOnly=true可以只生成增强类而不生成对象

  ```java
  protected Object firstInstance(Class type) throws Exception {
      if (classOnly) {
          return type;
      } else {
          return createUsingReflection(type);
      }
  }
  ```

- 反射创建增强类对象，然后给对象的Callbacks参数赋值，通过Callback实现对方法的增强或者覆盖

  ```java
  private Object createUsingReflection(Class type) {
      setThreadCallbacks(type, callbacks);//设置Callback
      try{
          if (argumentTypes != null) {//创建对象
              return ReflectUtils.newInstance(type, argumentTypes, arguments);
          } else {//创建对象
              return ReflectUtils.newInstance(type);
          }
      }finally{
       // clear thread callbacks to allow them to be gc'd
       setThreadCallbacks(type, null);
      }
  }
  ```

- 通过反射将Callback参数赋值到增强类对象中

  ```java
  private static void setCallbacksHelper(Class type, Callback[] callbacks, String methodName) {
      // TODO: optimize
      try {
          Method setter = getCallbacksSetter(type, methodName);
          setter.invoke(null, new Object[]{ callbacks });
      } catch (NoSuchMethodException e) {
       //...
      }
  }
  ```