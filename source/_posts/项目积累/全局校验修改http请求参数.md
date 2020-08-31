---
title: 全局校验修改http请求参数
date: 2019-08-20 19:12:30
tags:
- http
categories:
- 项目积累
---

# 全局校验修改http请求参数

开发rest接口的时候，经常会遇到加解密、签名验证的情况，将这些业务无关的操作统一处理，可以提高系统的开发效率和稳定性，同时提高代码的复用性和可读性

## 切面处理

使用切面进行拦截

首先定义一个注解，用于在方法声明需要aop拦截校验权限

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface CheckPermission {
    String value() default "";
}
```

定义切面，对请求参数进行统一校验

```java
@Aspect
@Component
@ConditionalOnProperty("security.enable")
@Slf4j
public class CheckPermissionAspect {

    @Around("@annotation(CheckPermission)")
    public Object checkPermission(ProceedingJoinPoint joinPoint) throws Throwable {
        HttpServletRequest request = ((ServletRequestAttributes) RequestContextHolder.getRequestAttributes()).getRequest();
        String url = request.getRequestURL().toString();
        MethodSignature methodSignature = (MethodSignature) joinPoint.getSignature();
        Method method = methodSignature.getMethod();
        Object requestParam = null;
        //获取请求参数
        for (int i = 0; i < method.getParameterCount(); i++) {
            Annotation[] parameterAnnotations = method.getParameterAnnotations()[i];
            for (int j = 0; j < parameterAnnotations.length; j++) {
                Annotation parameterAnnotation = parameterAnnotations[j];
                if (parameterAnnotation.annotationType().equals(RequestBody.class)) {
                    requestParam = joinPoint.getArgs()[i];
                }
            }
        }
        log.info("接收到请求 url:{},参数:{}", url, JSON.toJSONString(requestParam));
        //在这里做权限校验
        boolean permissionDeny = true;
        if (!permissionDeny) {
            BaseCallInResp baseCallInResp = new BaseCallInResp();
            baseCallInResp.setRspCd(CodeEnum.UNAUTHORIZED.getCode());
            baseCallInResp.setRspInf(CodeEnum.UNAUTHORIZED.getMsg());
            return baseCallInResp;
        }
        return joinPoint.proceed();
    }
}
```

## filter拦截器处理

有一种情况，请求参数都是加密的，而controller中接收的肯定是解密后数据，如果在请求到达controller之前将加密参数修改为解密后的参数，返回响应参数将controller返回的原始报文加密后再返回，使用aop是无法完成的，所以这里使用Filter+RequestWrapper+ResponseWrapper来实现

首先定义一个filter，在dofilter中对request和response进行处理，将加密参数转换为原始参数，将原始响应报文转换为加密响应报文

```java
@Slf4j
public class ParamFilter implements Filter {

    /**
     * 是否开启验签 解密
     */
    private boolean securityEnable;
	
    public ParamFilter(boolean securityEnable) {
        this.securityEnable = securityEnable;
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
        if (false) {
            String clientId = "";
            String clientKey = "";
            log.info("访问签名加密接口 clientId:{},clientKey:{}", clientId);
            ParamRequestWrapper requestWrapper = new ParamRequestWrapper((HttpServletRequest) request);
            ParamResponseWrapper responseWrapper = new ParamResponseWrapper((HttpServletResponse) response);
            String body = requestWrapper.getBody();
            log.info("请求url:{},参数:{}", ((HttpServletRequest) request).getRequestURL().toString(), body);
            if (StringUtils.isBlank(body)) {
                log.warn("请求内容为空");
                writeResponse(clientKey, buildFailResult(), response);
                return;
            }
            String clientIdParam = JSON.parseObject(body).getString("clientId");
            if (!StringUtils.equals(clientIdParam, clientId)) {
                log.warn("clientId校验未通过,clientId:{},clientIdParam:{}", clientId, clientIdParam);
                writeResponse(clientKey, buildFailResult(), response);
                return;
            }
            /*
            1、对报文的rspData解密
            2、截取解密后的字符串前面的json报文（后面一串是签名）
            3、对json报文做map排序、urlencode
            4、对3步骤的字符串做签名
            5、比较2中签名与通过参数签名后的值是否一致，一致则验签通过
             */
            String reqData = JSON.parseObject(body).getString("reqData");
            String decryptReqData = "";
            //从参数中获取 签名内容
            String signData = "";
            //从参数中获取 实际请求内容
            String paramData = "";
            String sign = SignUtils.getSignStr(SignUtils.getJosn(paramData));
            if (!StringUtils.equals(sign, signData)) {
                log.warn("验签未通过,paramData:{},signData:{},sign:{}", paramData, signData, sign);
                writeResponse(clientKey, buildFailResult(), response);
                return;
            }
            log.info("解密后数据:{}", paramData);
            //将解密后的数据set到包装的request中
            requestWrapper.setBody(paramData);
            //放行
            chain.doFilter(requestWrapper, responseWrapper);
            //获取responseWrapper中的原始响应报文
            String content = responseWrapper.getContent();
            //注意响应报文还是要用原始的response进行write
            writeResponse(clientKey, content, response);
        }else {
            chain.doFilter(request, response);
        }
    }

    private void writeResponse( String clientKey, String content, ServletResponse response) throws IOException {
        log.info("返回签名加密前数据:{}", content);
        //对原始响应报文进行加密处理
        String encryptResult = SignUtils.encryptData(clientKey, JSON.parseObject(content));
        Map<String, Object> params = Maps.newHashMap();
        params.put("rspData", encryptResult);
        String result = JSON.toJSONString(params);
        log.info("返回签名加密后数据:{}", result);
        //将签名加密后的数据 写到response中
        ServletOutputStream out = response.getOutputStream();
        out.write(result.getBytes());
        out.flush();
    }

    public String buildFailResult() {
        BaseCallInResp baseCallInResp = new BaseCallInResp();
        baseCallInResp.setRspCd(CodeEnum.UNAUTHORIZED.getCode());
        baseCallInResp.setRspInf(CodeEnum.UNAUTHORIZED.getMsg());
        return JSON.toJSONString(baseCallInResp);
    }
    
    @Override
    public void init(FilterConfig filterConfig) throws ServletException {
    }

    @Override
    public void destroy() {
    }
}
```

定义requestWrapper，用于封装解密后的请求参数

```java
@Slf4j
@Data
public class ParamRequestWrapper extends HttpServletRequestWrapper {
    /**
     * 请求体
     */
    private String body;

    public ParamRequestWrapper(HttpServletRequest request) throws IOException {
        super(request);
        body = getBodyString(request);
    }

    @Override
    public BufferedReader getReader() throws IOException {
        return new BufferedReader(new InputStreamReader(getInputStream()));
    }

    @Override
    public ServletInputStream getInputStream() throws IOException {

        final ByteArrayInputStream bais = new ByteArrayInputStream(body.getBytes("UTF-8"));

        return new ServletInputStream() {
            @Override
            public int read() throws IOException {
                return bais.read();
            }
            @Override
            public boolean isFinished() {
                return false;
            }
            @Override
            public boolean isReady() {
                return false;
            }
            @Override
            public void setReadListener(ReadListener readListener) {
            }
        };
    }

    /**
     * 获取请求体
     *
     * @param request
     * @return
     */
    public static String getBodyString(ServletRequest request) {
        StringBuilder sb = new StringBuilder();
        try(InputStream inputStream = request.getInputStream();BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, "UTF-8"))){
            String line = "";
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
        } catch (IOException e) {
            log.error("read param error:{}", e);
        }
        return sb.toString();
    }
}
```

定义responseWrapper，接收controller返回的原始响应报文

```java
@Slf4j
public class ParamResponseWrapper extends HttpServletResponseWrapper {

    private ByteArrayServletOutputStream buffer;
    private PrintWriter out;

    public ParamResponseWrapper(HttpServletResponse response) {
        super(response);
        buffer = new ByteArrayServletOutputStream();
    }

    @Override
    public PrintWriter getWriter() throws IOException {
        if (out == null) {
            out = new PrintWriter(buffer);
        }
        return out;
    }

    @Override
    public ServletOutputStream getOutputStream() throws IOException {
        return buffer;
    }

    public String getContent() {
        try {
            return new String(buffer.toByteArray(), "UTF-8");
        } catch (UnsupportedEncodingException e) {
            log.error("response error:{}",e);
            return null;
        }
    }

    @Override
    public void flushBuffer() throws IOException {
        if (out != null) {
            out.flush();
        }
        if (buffer != null) {
            buffer.flush();
        }

    }
}
```

配置filter

```java
@Configuration
public class WebConfig implements WebMvcConfigurer{
    /**
     * 是否开启验签解密
     */
    @Value("${security.enable}")
    private boolean securityEnable;
    @Bean
    public FilterRegistrationBean paramFilterBean() {
        FilterRegistrationBean frBean = new FilterRegistrationBean();
        frBean.setFilter(new ParamFilter(securityEnable));
        frBean.addUrlPatterns("/test/*");
        frBean.setOrder(-1);
        return frBean;
    }
}
```


