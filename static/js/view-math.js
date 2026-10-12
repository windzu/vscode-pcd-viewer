export function fitCloudView(bounds, target, fov, aspect) {
    const extent = bounds.min.map((value, axis) => Math.max(
        Math.abs(value - target[axis]), Math.abs(bounds.max[axis] - target[axis])));
    const radius = Math.max(Math.hypot(...extent), 0.1);
    const vertical = fov * Math.PI / 360;
    const horizontal = Math.atan(Math.tan(vertical) * Math.max(aspect, 0.000001));
    return { radius, distance: radius / Math.sin(Math.min(vertical, horizontal)) * 1.2 };
}
