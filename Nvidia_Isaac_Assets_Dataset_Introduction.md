# NVIDIA Isaac Assets 数据集介绍

## 1. 概述

**NVIDIA Isaac Assets** 是 NVIDIA 为机器人仿真平台 **Isaac Sim** 提供的一套预配置、仿真就绪的 3D 模型与组件集合。该数据集基于 **OpenUSD（Universal Scene Description）** 格式构建，涵盖超过 1,000 个 SimReady 3D 资产，包括工业设备、仓储环境、各类机器人模型等，旨在加速机器人模拟、合成数据生成及 AI 模型训练工作流程。

Isaac Sim 是 NVIDIA Omniverse 平台上的开源参考框架，能够让开发者在物理仿真的虚拟环境中模拟和测试 AI 驱动的机器人方案。Isaac Assets 是该生态系统的核心组成部分。

---

## 2. 资产分类

### 2.1 机器人资产

Isaac Sim 提供了多种类别的预配置机器人模型：

| 类别 | 代表型号 |
|------|---------|
| **轮式机器人** | iRobot Create3、Turtlebot3、NVIDIA JetBot、NovaCarter |
| **全向机器人** | idealworks iw.hub 系列 |
| **四足机器人** | ANYbotics ANYmal、Boston Dynamics Spot、Unitree、NVIDIA Leatherback |
| **机械臂** | Fanuc、KUKA、Universal Robots、Techman、Franka Panda、Fraunhofer Evobot |
| **人形机器人** | 1X、Agility Robotics Digit、Fourier Intelligence、Sanctuary AI |
| **自主移动机器人 (AMR)** | idealworks iw.hub、iRobot |
| **叉车** | ForkliftB、ForkliftC 系列 |
| **无人机** | 多旋翼航拍无人机 |

### 2.2 环境与道具资产

- **工业仓储环境**：传送带、货架、托盘、箱体等
- **物理可抓取物体**：用于机器人抓取和放置测试的物体
- **场景组件**：地面、墙壁、照明等基础场景构建元素
- **SimReady 3D 资产**：超过 1,000 个预配置的仿真就绪资产

### 2.3 专项数据集（Hugging Face 上发布）

| 数据集 | 描述 | 规模 |
|--------|------|------|
| **PhysicalAI-SimReady-Warehouse-01** | 工业仓储环境 OpenUSD 资产集合，含 800+ 物体 | 包含 Props、Scenarios、Assemblies 等类别 |
| **PhysicalAI-Robotics-Manipulation-Augmented** | Franka Panda 机器人执行方块堆叠任务的 1,000 条合成演示数据 | 69.4 GB，多模态（RGB、深度、分割、法线） |
| **PhysicalAI-Robotics-NuRec** | Nova Carter 机器人数据的 3D 场景重建，含碰撞检测网格和渲染组件 | 包含占用网格图和办公环境 |

---

## 3. 资产结构

Isaac Sim 采用标准化的三阶段资产组织结构：

### 3.1 源阶段（Source）

包含原始导入资产：

- `asset_base.usd` — 基础资产文件
- `parts.usd` — 独立部件
- `materials.usd` — 材质定义

### 3.2 变换阶段（Transformation）

优化资产以适配仿真需求：

- 扁平化层级结构
- 分离视觉几何体与碰撞体
- 合并网格以降低复杂度
- 简化材质和纹理

### 3.3 特征阶段（Features）

以轻量级 USD 层的形式添加仿真能力：

- `asset_physics.usd` — 物理属性（质量、摩擦力、碰撞体）
- 传感器配置
- 控制图（Action/Articulation graphs）
- ROS/ROS2 集成

最终通过 `asset.usd` 文件将所有组件通过子层（sublayer）和载荷（payload）机制整合。

---

## 4. 物理属性与 USD Schema

### 4.1 核心物理 Schema

所有资产的物理属性基于 **USD Physics Schemas** 和 **PhysX Schemas** 定义：

| Schema | 功能 |
|--------|------|
| `USDPhysics Collider` | 为几何基元（prim）定义碰撞形状 |
| `USDPhysics Mass` | 以千克（kg）为单位设置质量 |
| `USDPhysics Material` | 定义静摩擦、动摩擦、密度、恢复系数 |
| `USDPhysics Rigid Body` | 应用于根基元以启用物理参与 |

物理属性命名遵循 `schema_name:attribute_name` 规范（如 `physics:velocity`）。

### 4.2 机器人专用 Schema

实验性的 **IsaacRobotAPI** 通过结构化 API 标准化机器人表示：

- Links（连杆）定义
- Joints（关节）定义
- 元数据（Metadata）
- 运动学树（Kinematic Tree）

---

## 5. 合成数据生成

Isaac Sim 通过内置的 **Replicator** 框架实现大规模合成数据生成（Synthetic Data Generation, SDG）：

### 5.1 核心能力

- **域随机化（Domain Randomization）**：系统性地变换物体姿态、光照条件、纹理和相机角度
- **自动化标注**：通过 Annotator 和 Writer API 自动生成语义标注
- **多模态输出**：RGB 图像、深度图、实例分割、语义分割、法线图、边界框等

### 5.2 GR00T 合成数据流水线

NVIDIA Isaac GR00T 提供专用的合成数据生成蓝图：

| 蓝图 | 功能 |
|------|------|
| **GR00T-Mimic** | 从少量人类演示生成大量合成运动轨迹 |
| **GR00T-Dreams** | 基于 Cosmos 世界基础模型，从单张图像和语言指令生成轨迹数据 |
| **GR00T-Teleop** | 通过远程操作采集高质量人类演示数据 |

### 5.3 典型工作流

```
人类演示采集 → 仿真环境构建 → 域随机化配置 → 批量数据生成 → 模型训练
     ↓                                                    ↓
 GR00T-Teleop                                    Isaac Lab / Isaac Sim
```

---

## 6. 应用场景

### 6.1 感知模型训练

利用 Replicator 生成的合成数据训练目标检测、语义分割等视觉感知模型，解决真实数据采集成本高、标注困难的问题。

### 6.2 机器人操控学习

通过 Isaac Lab 进行 GPU 加速的强化学习训练，支持零样本迁移（zero-shot transfer）和跨体型泛化（cross-embodiment generalization）。

### 6.3 导航与运动规划

使用预配置的仓储环境和机器人模型进行导航策略训练和运动规划测试。

### 6.4 Sim-to-Real 迁移

结合全身强化学习和合成数据驱动的训练流水线，将仿真环境中训练的策略迁移到真实机器人上。

---

## 7. 获取与使用

### 7.1 获取途径

- **Isaac Sim 内置**：通过 Asset Browser / Content Browser 访问，路径位于 `Isaac Sim/Robots` 等文件夹
- **NVIDIA NGC**：通过 NVIDIA GPU Cloud 下载 Isaac Sim 及其资产包
- **Hugging Face**：在 NVIDIA 官方 Hugging Face 组织页面获取专项数据集
- **GitHub**：GR00T-Dreams 等工具链在 GitHub 开源

### 7.2 许可协议

大部分数据集采用 **CC-BY-4.0** 许可协议，允许商业和非商业用途的使用、修改和再分发。

### 7.3 系统要求

- NVIDIA RTX GPU（推荐 RTX 3070 及以上）
- Isaac Sim 4.x 或更高版本
- 支持 Linux（Ubuntu）操作系统
- 安装 NVIDIA Omniverse Launcher

---

## 8. 相关链接

| 资源 | 链接 |
|------|------|
| Isaac Sim 官方文档 | https://docs.isaacsim.omniverse.nvidia.com/ |
| Isaac Sim 资产概览 | https://docs.isaacsim.omniverse.nvidia.com/latest/assets/usd_assets_overview.html |
| 机器人资产列表 | https://docs.isaacsim.omniverse.nvidia.com/latest/assets/usd_assets_robots.html |
| 资产结构说明 | https://docs.isaacsim.omniverse.nvidia.com/latest/robot_setup/asset_structure.html |
| Isaac GR00T | https://developer.nvidia.com/isaac/gr00t |
| PhysicalAI-SimReady-Warehouse-01 | https://huggingface.co/datasets/nvidia/PhysicalAI-SimReady-Warehouse-01 |
| PhysicalAI-Robotics-Manipulation-Augmented | https://huggingface.co/datasets/nvidia/PhysicalAI-Robotics-Manipulation-Augmented |
| PhysicalAI-Robotics-NuRec | https://huggingface.co/datasets/nvidia/PhysicalAI-Robotics-NuRec |
| Isaac Sim 开发者页面 | https://developer.nvidia.com/isaac-sim |
| Replicator 合成数据生成 | https://developer.nvidia.com/omniverse/replicator |
