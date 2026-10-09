# 视频生产架构

把稳定的技术关系交给程序，把每期独有的叙事判断留给创作。

## 目标分层

```text
内容层       script / research / storyboard
语义时间层   TTS逐词时间 -> 段落、转折、数字、CTA 等稳定锚点
单期配置层   镜头使用哪个语义区间、素材、组件和视觉变体
组件层       EvidenceReveal / Compare / Timeline / DataChange
轨道层       旁白、BGM、字幕、解释图层
运行与结果   Remotion渲染 -> 视觉校验 -> 发布包 manifest
```

每期默认只新增单期配置、素材与少量自定义场景，不复制注册、画布尺寸与字幕查找代码。
