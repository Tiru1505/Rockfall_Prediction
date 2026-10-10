"""
Export the trained U-Net to ONNX for serving.

    python export_onnx.py --checkpoint runs/unet/best.pt --output landslide_unet.onnx

WHY ONNX AND NOT THE .pt FILE: the backend runs on Render's free tier, which has
512MB of RAM, and already loads pandas and numpy. PyTorch is ~800MB installed and
uses several hundred MB just to import — the service would be killed on boot.
onnxruntime is ~15MB and a fraction of the memory, and runs this model on CPU in
tens of milliseconds.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import torch

from model import UNet


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--checkpoint", default="runs/unet/best.pt")
    p.add_argument("--output", default="landslide_unet.onnx")
    p.add_argument("--opset", type=int, default=13)
    args = p.parse_args()

    ckpt = torch.load(args.checkpoint, map_location="cpu")
    model = UNet(14, 1, base=ckpt.get("base_channels", 32))
    model.load_state_dict(ckpt["model"])
    model.eval()

    dummy = torch.randn(1, 14, 128, 128)

    torch.onnx.export(
        model, dummy, args.output,
        input_names=["input"], output_names=["logits"],
        # Batch stays dynamic so several patches can be scored in one call.
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=args.opset,
        do_constant_folding=True,
    )

    # torch's current exporter writes tensors above a size threshold to a
    # sidecar `<name>.onnx.data` file. That leaves the .onnx itself a ~100KB
    # graph that cannot run on its own, and the sidecar is easy to lose when
    # copying the model into the backend or downloading it from Colab.
    # Re-save as one self-contained file.
    import onnx

    model_proto = onnx.load(args.output)  # pulls in the external data
    onnx.save_model(model_proto, args.output, save_as_external_data=False)

    sidecar = Path(str(args.output) + ".data")
    if sidecar.exists():
        sidecar.unlink()
        print("merged external weights back into a single file")

    size_mb = Path(args.output).stat().st_size / 1e6
    print(f"exported {args.output}  ({size_mb:.1f} MB)")

    # Verify the export actually reproduces the PyTorch output — a silently
    # wrong export is worse than a failed one.
    try:
        import numpy as np
        import onnxruntime as ort

        sess = ort.InferenceSession(args.output, providers=["CPUExecutionProvider"])
        onnx_out = sess.run(None, {"input": dummy.numpy()})[0]
        with torch.no_grad():
            torch_out = model(dummy).numpy()

        max_diff = float(np.abs(onnx_out - torch_out).max())
        print(f"max |onnx - pytorch| = {max_diff:.2e}", "OK" if max_diff < 1e-4 else "MISMATCH")
    except ImportError:
        print("onnxruntime not installed — skipping verification "
              "(pip install onnxruntime to check)")


if __name__ == "__main__":
    main()
