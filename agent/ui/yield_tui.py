"""
Yield Dashboard TUI - 终端用户界面

@trace Vol.2 S-UI-04, Task-22
@constraint D-YIELD-01~03: Dashboard TUI, Demo 包含收益

使用 rich 库构建精美的终端界面，展示:
- Yield 模块状态 (开启/关闭)
- 当前策略类型
- 预估收益范围 (诚实声明)
- 实时余额
"""

import asyncio
from typing import Optional
from datetime import datetime

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.layout import Layout
    from rich.text import Text
    from rich.live import Live
    from rich.progress import Progress, SpinnerColumn, TextColumn
    from rich.align import Align
    from rich import box
except ImportError:
    raise ImportError("请安装 rich 库: pip install rich")

import sys
from pathlib import Path

# 添加项目根目录到 path
sys.path.insert(0, str(Path(__file__).parent.parent))

from wallet.yield_interface import (
    YieldStrategy,
    YieldConfig,
    YieldEstimate,
    YieldStrategyType,
    create_yield_strategy,
    LightningRoutingStrategy,
)


class YieldDashboard:
    """
    Yield Dashboard TUI
    
    展示 Yield 模块的运行状态和收益预估
    """
    
    def __init__(
        self,
        config: Optional[YieldConfig] = None,
        refresh_interval: float = 2.0,
    ):
        """
        初始化 Dashboard
        
        Args:
            config: Yield 模块配置
            refresh_interval: 刷新间隔 (秒)
        """
        self.console = Console()
        self.config = config or YieldConfig(enabled=False)
        self.strategy = create_yield_strategy(self.config)
        self.refresh_interval = refresh_interval
        self._running = False
        
        # Mock 数据 (Phase 0)
        self._mock_balance_sats = 100_000  # 100k sats
        self._mock_allocated_sats = 0
        self._mock_routing_fees_earned = 0
        
    def _create_status_panel(self) -> Panel:
        """创建状态面板"""
        status_text = Text()
        
        # 模块状态
        if self.config.enabled:
            status_text.append("● ", style="green bold")
            status_text.append("已启用", style="green")
        else:
            status_text.append("○ ", style="red bold")
            status_text.append("已禁用", style="red dim")
        
        status_text.append("\n\n")
        
        # 策略类型
        status_text.append("策略: ", style="dim")
        strategy_name = {
            YieldStrategyType.LIGHTNING_ROUTING: "⚡ Lightning 路由",
            YieldStrategyType.LIQUIDITY_POOL: "🌊 流动性池",
            YieldStrategyType.CUSTOM: "🔧 自定义",
        }.get(self.config.strategy_type, "未知")
        status_text.append(strategy_name, style="cyan bold")
        
        status_text.append("\n\n")
        
        # 最大分配比例
        status_text.append("最大分配: ", style="dim")
        status_text.append(f"{self.config.max_allocation_percent}%", style="yellow")
        
        status_text.append("\n")
        
        # 最低保留
        status_text.append("最低保留: ", style="dim")
        status_text.append(f"{self.config.min_reserve_sats:,} sats", style="yellow")
        
        return Panel(
            Align.center(status_text),
            title="[bold blue]🔧 模块配置[/]",
            border_style="blue",
            box=box.ROUNDED,
        )
    
    def _create_balance_panel(self) -> Panel:
        """创建余额面板"""
        balance_text = Text()
        
        # 总余额
        balance_text.append("💰 总余额\n", style="bold")
        balance_text.append(f"{self._mock_balance_sats:,}", style="green bold")
        balance_text.append(" sats\n\n", style="dim")
        
        # 已分配
        balance_text.append("📊 已分配\n", style="bold")
        balance_text.append(f"{self._mock_allocated_sats:,}", style="cyan bold")
        balance_text.append(" sats\n\n", style="dim")
        
        # 可用余额
        available = self._mock_balance_sats - self._mock_allocated_sats
        balance_text.append("💵 可用\n", style="bold")
        balance_text.append(f"{available:,}", style="yellow bold")
        balance_text.append(" sats", style="dim")
        
        return Panel(
            Align.center(balance_text),
            title="[bold green]💎 余额状态[/]",
            border_style="green",
            box=box.ROUNDED,
        )
    
    def _create_yield_panel(self) -> Panel:
        """创建收益预估面板"""
        estimate = YieldEstimate.lightning_routing()
        
        yield_text = Text()
        
        # 年化收益范围
        yield_text.append("📈 年化收益预估\n", style="bold")
        yield_text.append(
            f"{estimate.annual_rate_low*100:.2f}% ~ {estimate.annual_rate_high*100:.2f}%\n\n",
            style="cyan bold"
        )
        
        # 置信度
        yield_text.append("🎯 置信度: ", style="dim")
        yield_text.append(f"{estimate.confidence}\n\n", style="yellow")
        
        # 累计收益 (Mock)
        yield_text.append("💫 路由费累计\n", style="bold")
        yield_text.append(f"{self._mock_routing_fees_earned:,}", style="green bold")
        yield_text.append(" sats", style="dim")
        
        return Panel(
            Align.center(yield_text),
            title="[bold cyan]📊 收益概览[/]",
            border_style="cyan",
            box=box.ROUNDED,
        )
    
    def _create_disclaimer_panel(self) -> Panel:
        """创建风险声明面板"""
        estimate = YieldEstimate.lightning_routing()
        
        disclaimer_text = Text(estimate.disclaimer, style="dim italic")
        
        return Panel(
            disclaimer_text,
            title="[bold red]⚠️ 风险声明[/]",
            border_style="red dim",
            box=box.ROUNDED,
        )
    
    def _create_layout(self) -> Layout:
        """创建整体布局"""
        layout = Layout()
        
        layout.split(
            Layout(name="header", size=3),
            Layout(name="main"),
            Layout(name="footer", size=6),
        )
        
        # Header
        header_text = Text()
        header_text.append("⚡ ", style="yellow")
        header_text.append("Daemon Yield Dashboard", style="bold white")
        header_text.append(" ⚡", style="yellow")
        header_text.append(f"\n{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", style="dim")
        
        layout["header"].update(
            Panel(Align.center(header_text), style="bold on dark_blue", box=box.DOUBLE)
        )
        
        # Main content (3 columns)
        layout["main"].split_row(
            Layout(self._create_status_panel(), name="status"),
            Layout(self._create_balance_panel(), name="balance"),
            Layout(self._create_yield_panel(), name="yield"),
        )
        
        # Footer (disclaimer)
        layout["footer"].update(self._create_disclaimer_panel())
        
        return layout
    
    def display_static(self) -> None:
        """显示静态 Dashboard (单次渲染)"""
        self.console.print(self._create_layout())
    
    async def run_live(self, duration: Optional[float] = None) -> None:
        """
        运行实时 Dashboard
        
        Args:
            duration: 运行时长 (秒)，None 表示持续运行直到 Ctrl+C
        """
        self._running = True
        start_time = asyncio.get_event_loop().time()
        
        with Live(
            self._create_layout(),
            console=self.console,
            refresh_per_second=1,
            screen=True,
        ) as live:
            try:
                while self._running:
                    # 更新 Mock 数据 (模拟变化)
                    self._mock_routing_fees_earned += 1
                    
                    # 刷新布局
                    live.update(self._create_layout())
                    
                    # 检查时长限制
                    if duration:
                        elapsed = asyncio.get_event_loop().time() - start_time
                        if elapsed >= duration:
                            break
                    
                    await asyncio.sleep(self.refresh_interval)
                    
            except KeyboardInterrupt:
                pass
            finally:
                self._running = False
    
    def stop(self) -> None:
        """停止 Dashboard"""
        self._running = False


def create_demo_dashboard() -> YieldDashboard:
    """
    创建演示 Dashboard
    
    用于 Demo 和测试
    """
    config = YieldConfig(
        enabled=True,
        strategy_type=YieldStrategyType.LIGHTNING_ROUTING,
        max_allocation_percent=50.0,
        min_reserve_sats=10000,
        auto_compound=True,
    )
    return YieldDashboard(config=config)


async def main():
    """CLI 入口"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Yield Dashboard TUI")
    parser.add_argument(
        "--enabled", 
        action="store_true", 
        help="启用 Yield 模块"
    )
    parser.add_argument(
        "--static",
        action="store_true",
        help="静态显示 (不实时刷新)"
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=None,
        help="运行时长 (秒)"
    )
    args = parser.parse_args()
    
    config = YieldConfig(enabled=args.enabled)
    dashboard = YieldDashboard(config=config)
    
    if args.static:
        dashboard.display_static()
    else:
        await dashboard.run_live(duration=args.duration)


if __name__ == "__main__":
    asyncio.run(main())
