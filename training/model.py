"""
U-Net for landslide segmentation.

Written out rather than imported from a library so every layer is explainable:
an encoder that halves resolution while doubling channels, a bottleneck, and a
decoder that upsamples back while concatenating the matching encoder feature map
(the skip connections). Skips are what let the output keep sharp boundaries —
without them the decoder only ever sees heavily downsampled features and
landslide edges come out blurred.

Input is 14 channels (Sentinel-2 B1-B12, plus slope and DEM), not the usual 3, so
ImageNet-pretrained encoders don't transfer here. The model is trained from
scratch, which is fine at 128x128 with ~2.6k training patches.

Output is a single channel of raw logits. Sigmoid is applied in the loss
(BCEWithLogits is numerically stabler) and at inference time.
"""
from __future__ import annotations

import torch
import torch.nn as nn


class DoubleConv(nn.Module):
    """(conv -> BN -> ReLU) x2, the standard U-Net block."""

    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.block(x)


class Down(nn.Module):
    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.pool_conv = nn.Sequential(nn.MaxPool2d(2), DoubleConv(in_ch, out_ch))

    def forward(self, x):
        return self.pool_conv(x)


class Up(nn.Module):
    def __init__(self, in_ch: int, skip_ch: int, out_ch: int):
        super().__init__()
        self.up = nn.ConvTranspose2d(in_ch, in_ch // 2, 2, stride=2)
        self.conv = DoubleConv(in_ch // 2 + skip_ch, out_ch)

    def forward(self, x, skip):
        x = self.up(x)
        # 128x128 halves cleanly to 8x8, so shapes always line up here. The pad
        # is defensive in case the patch size is ever changed to something that
        # doesn't divide by 16.
        if x.shape[-2:] != skip.shape[-2:]:
            dy = skip.size(-2) - x.size(-2)
            dx = skip.size(-1) - x.size(-1)
            x = nn.functional.pad(x, [dx // 2, dx - dx // 2, dy // 2, dy - dy // 2])
        return self.conv(torch.cat([skip, x], dim=1))


class UNet(nn.Module):
    def __init__(self, in_channels: int = 14, out_channels: int = 1, base: int = 32):
        super().__init__()
        self.inc = DoubleConv(in_channels, base)          # 128 -> 128
        self.down1 = Down(base, base * 2)                  # 128 -> 64
        self.down2 = Down(base * 2, base * 4)              # 64  -> 32
        self.down3 = Down(base * 4, base * 8)              # 32  -> 16
        self.down4 = Down(base * 8, base * 16)             # 16  -> 8   (bottleneck)

        self.up1 = Up(base * 16, base * 8, base * 8)       # 8   -> 16
        self.up2 = Up(base * 8, base * 4, base * 4)        # 16  -> 32
        self.up3 = Up(base * 4, base * 2, base * 2)        # 32  -> 64
        self.up4 = Up(base * 2, base, base)                # 64  -> 128
        self.outc = nn.Conv2d(base, out_channels, 1)

    def forward(self, x):
        x1 = self.inc(x)
        x2 = self.down1(x1)
        x3 = self.down2(x2)
        x4 = self.down3(x3)
        x5 = self.down4(x4)

        x = self.up1(x5, x4)
        x = self.up2(x, x3)
        x = self.up3(x, x2)
        x = self.up4(x, x1)
        return self.outc(x)  # logits


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
