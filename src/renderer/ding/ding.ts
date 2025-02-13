const { ipcRenderer, clipboard, nativeImage } = require("electron") as typeof import("electron");
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const os = require("os") as typeof import("os");
import root_init from "../root/root";
root_init();
let config_path = new URLSearchParams(location.search).get("config_path");
const Store = require("electron-store");
var store = new Store({
    cwd: config_path || "",
});

var screen_id = "";
ipcRenderer.on("screen_id", (event, id) => {
    screen_id = id;
});

var move: { id: string; screenid: string; more: move_type };

ipcRenderer.on("ding", (event, type, id, screenid, more) => {
    console.log(type, id, screenid, more);
    switch (type) {
        case "close":
            close2(document.getElementById(id));
            break;
        case "move_start":
            move = { id, screenid, more };
            break;
        case "move_end":
            move = null;
            break;
        case "move_hide":
            if (screen_id != screenid) {
                document.getElementById(id).style.display = "none";
                break;
            }
    }
});

function send_event(type: "close" | "move_start" | "move_end" | "move_hide", id: string, more?: any) {
    ipcRenderer.send("ding_event", type, id, screen_id, more);
}

/**
 * x,y都是小数百分比
 */
type move_type = { x: number; y: number; zoom: number };

var ratio = window.devicePixelRatio;
var changing = null;
var photos: { [key: string]: [number, number, number, number] } = {};
var urls = {};
ipcRenderer.on("img", (event, screenid, wid, x, y, w, h, url) => {
    photos[wid] = [x, y, w, h];
    urls[wid] = url;
    let div = document.createElement("div");
    div.id = wid;
    div.className = "ding_photo";
    // 防止延迟
    ratio = window.devicePixelRatio;
    div.style.left = x / ratio + "px";
    div.style.top = y / ratio + "px";
    div.style.width = w / ratio + "px";
    div.style.height = h / ratio + "px";
    if (screenid != screen_id) {
        div.style.display = "none";
    }
    var img = document.createElement("img");
    img.draggable = false;
    img.src = url;
    img.className = "img";
    var tool_bar = document.querySelector("#tool_bar").cloneNode(true) as HTMLElement;
    (<HTMLElement>tool_bar.querySelector("#tool_bar_c")).style.display = "flex";
    // 顶栏
    div.onmouseenter = () => {
        (<HTMLElement>tool_bar.querySelector("#tool_bar_c")).style.transform = "translateY(0)";
    };
    div.onmouseleave = () => {
        (<HTMLElement>tool_bar.querySelector("#tool_bar_c")).style.transform = "translateY(-105%)";
    };
    // 透明
    (<HTMLElement>tool_bar.querySelector("#透明度")).oninput = () => {
        img.style.opacity = `${Number((<HTMLInputElement>tool_bar.querySelector("#透明度")).value) / 100}`;
        (<HTMLElement>tool_bar.querySelector("#透明度_p")).innerHTML =
            (<HTMLInputElement>tool_bar.querySelector("#透明度")).value + "%";
    };
    // 大小
    (<HTMLElement>tool_bar.querySelector("#size > span")).onblur = () => {
        if (isFinite(Number((<HTMLElement>tool_bar.querySelector("#size > span")).innerHTML))) {
            var zoom = Number((<HTMLElement>tool_bar.querySelector("#size > span")).innerHTML) / 100;
            if (zoom < 0.05) zoom = 0.05;
            div_zoom(div, zoom, 0, 0, false);
            setTimeout(() => {
                resize(div, zoom);
            }, 400);
        }
    };
    (<HTMLElement>tool_bar.querySelector("#size > span")).onkeydown = (e) => {
        if (e.key == "Enter") {
            e.preventDefault();
            if (isFinite(Number((<HTMLElement>tool_bar.querySelector("#size > span")).innerHTML))) {
                var zoom = Number((<HTMLElement>tool_bar.querySelector("#size > span")).innerHTML) / 100;
                if (zoom < 0.05) zoom = 0.05;
                div_zoom(div, zoom, 0, 0, false);
                setTimeout(() => {
                    resize(div, zoom);
                }, 400);
            }
        }
    };
    // 滚轮缩放
    div.onwheel = (e) => {
        if (e.deltaY != 0) {
            var zoom =
                (Number(div.querySelector("#size > span").innerHTML) - (e.deltaY / Math.abs(e.deltaY)) * 10) / 100;
            if (zoom < 0.05) zoom = 0.05;
            div_zoom(div, zoom, e.offsetX, e.offsetY, true);
            resize(div, zoom);
        }
    };
    // 三个按钮
    (<HTMLElement>tool_bar.querySelector("#minimize")).onclick = () => {
        minimize(div);
    };
    (<HTMLElement>tool_bar.querySelector("#back")).onclick = () => {
        back(div);
    };
    (<HTMLElement>tool_bar.querySelector("#close")).onclick = () => {
        close(div);
    };
    (<HTMLElement>tool_bar.querySelector("#copy")).onclick = () => {
        copy(div);
    };
    (<HTMLElement>tool_bar.querySelector("#edit")).onclick = () => {
        edit(div);
    };
    // 双击归位
    div.ondblclick = () => {
        back(div);
    };
    // 放到前面
    div.onclick = () => {
        div.style.zIndex = String(toppest + 1);
        document.getElementById("dock").style.zIndex = String(toppest + 2);
        toppest += 1;
    };
    div.appendChild(tool_bar);
    div.appendChild(img);
    document.querySelector("#photo").appendChild(div);

    // dock
    dock_i();

    resize(div, 1);
});

ipcRenderer.on("mouse", (e, x, y) => {
    let els = document.elementsFromPoint(x, y);
    if (screen_id) {
        let ignorex = false;
        for (let el of ignore_el) {
            if (els.includes(el)) {
                ignorex = true;
                break;
            }
        }
        if (els.length != 0) {
            if (move) {
                if (move.screenid != screen_id) {
                    let el = document.getElementById(move.id);
                    el.style.display = "";
                    send_event("move_hide", move.id);
                    let xx = x - photos[move.id][2] * move.more.zoom * move.more.x;
                    let yy = y - photos[move.id][3] * move.more.zoom * move.more.y;
                    el.style.left = xx + "px";
                    el.style.top = yy + "px";
                    el.style.width = photos[move.id][2] * move.more.zoom + "px";
                    el.style.height = photos[move.id][3] * move.more.zoom + "px";
                    resize(el, move.more.zoom);
                }
            }
        }
        if (els[0] == document.getElementById("photo") || ignorex) {
            ipcRenderer.send("ding_ignore", screen_id, true);
        } else {
            ipcRenderer.send("ding_ignore", screen_id, false);
        }
    }
});

function minimize(el) {
    div.style.transition = "var(--transition)";
    setTimeout(() => {
        div.style.transition = "";
    }, 400);
    el.classList.add("minimize");
}
var ignore_el = [];
function ignore(el: HTMLElement, v: boolean) {
    if (v) {
        ignore_el.push(el);
    } else {
        ignore_el = ignore_el.filter((e) => e != el);
    }
}
var tran_style = document.createElement("style");
tran_style.innerHTML = `.tran{${store.get("贴图.窗口.变换")}}`;
document.body.appendChild(tran_style);
/**
 * 窗口变换
 * @param {HTMLElement} el 窗口
 * @param {boolean} v 是否变换
 */
function transform(el, v) {
    if (v) {
        el.querySelector(".img").classList.add("tran");
    } else {
        el.querySelector(".img").classList.remove("tran");
    }
}
function back(el) {
    el.style.transition = "var(--transition)";
    setTimeout(() => {
        el.style.transition = "";
        resize(el, 1);
    }, 400);
    var p_s = photos[el.id];
    el.style.left = p_s[0] / ratio + "px";
    el.style.top = p_s[1] / ratio + "px";
    el.style.width = p_s[2] / ratio + "px";
    el.style.height = p_s[3] / ratio + "px";
    ipcRenderer.send("ding_p_s", el.id, p_s);

    el.querySelector("#透明度").value = "100";
    el.querySelector("#透明度_p").innerHTML = "100%";
    el.querySelector(".img").style.opacity = 1;
}
function close(el: HTMLElement) {
    ipcRenderer.send("ding_event", "close", el.id, screen_id, Object.keys(photos).length == 1);
}
function close2(el: HTMLElement) {
    el.remove();
    delete photos[el.id];
    delete urls[el.id];
    dock_i();
}
function copy(el: HTMLElement) {
    clipboard.writeImage(nativeImage.createFromDataURL(urls[el.id]));
}
function edit(el: HTMLElement) {
    let b = Buffer.from(urls[el.id].replace(/^data:image\/\w+;base64,/, ""), "base64");
    let save = path.join(os.tmpdir(), "eSearch", new Date().getTime() + ".png");
    fs.writeFile(save, b, () => {
        ipcRenderer.send("ding_edit", save);
    });
}

// 最高窗口
var toppest = 1;
var o_ps: number[];
var window_div = null;
var div: HTMLElement;
document.onmousedown = (e) => {
    let el = e.target as HTMLElement;
    if (el.id == "dock" || el.offsetParent.id == "dock") {
        if (!dock_show) {
            div = el;
            window_div = div;
            o_ps = [div.offsetLeft, div.offsetTop, div.offsetWidth, div.offsetHeight];
            changing = e;
            div.style.transition = "none";
        }
    } else if (el.id != "透明度" && el.id != "size") {
        div = el;
        if (div.id != "photo")
            while (div.className != "ding_photo") {
                div = div.offsetParent as HTMLElement;
            }
        window_div = div;
        o_ps = [div.offsetLeft, div.offsetTop, div.offsetWidth, div.offsetHeight];
        changing = e;

        send_event("move_start", div.id, {
            x: e.offsetX / div.offsetWidth,
            y: e.offsetY / div.offsetHeight,
            zoom: div.offsetWidth / photos[div.id][2],
        } as move_type);
    }
};
document.onmousemove = (e) => {
    let el = e.target as HTMLElement;
    if (!move && (el.id == "dock" || el.offsetParent.id == "dock")) {
        if (!dock_show) {
            if (window_div == null) {
                div = el;
                cursor(div, e);
            } else {
                cursor(window_div, e);
            }
        }
    } else {
        if (window_div == null) {
            div = el;
            if (div.id != "photo")
                while (div.className != "ding_photo") {
                    div = div?.offsetParent as HTMLElement;
                }
            cursor(div, e);
        } else {
            cursor(window_div, e);
        }
    }
};
document.onmouseup = (e) => {
    if (window_div != null)
        store.set("ding_dock", [document.getElementById("dock").offsetLeft, document.getElementById("dock").offsetTop]);
    o_ps = [];
    changing = null;
    send_event("move_end", window_div.id);
    window_div = null;
    div.style.transition = ""; // 用于dock动画
};

var direction = "";
function cursor(el, e) {
    var width = el.offsetWidth,
        height = el.offsetHeight;
    var p_x = e.clientX - el.offsetLeft,
        p_y = e.clientY - el.offsetTop;

    var num = 8;
    // 光标样式
    if (el.id == "dock" || el.offsetParent?.id == "dock") {
        if (window_div == null) {
            if (0 < p_x && p_x < width && 0 < p_y && p_y < height) {
                document.querySelector("html").style.cursor = "default";
                direction = "move";
            } else {
                direction = "";
            }
        }
    } else {
        // 不等于null移动中,自锁;等于,随时变
        if (window_div == null)
            switch (true) {
                case p_x <= num && p_y <= num:
                    document.querySelector("html").style.cursor = "nwse-resize";
                    direction = "西北";
                    break;
                case p_x >= width - num && p_y >= height - num:
                    document.querySelector("html").style.cursor = "nwse-resize";
                    direction = "东南";
                    break;
                case p_x >= width - num && p_y <= num:
                    document.querySelector("html").style.cursor = "nesw-resize";
                    direction = "东北";
                    break;
                case p_x <= num && p_y >= height - num:
                    document.querySelector("html").style.cursor = "nesw-resize";
                    direction = "西南";
                    break;
                case p_x <= num:
                    document.querySelector("html").style.cursor = "ew-resize";
                    direction = "西";
                    break;
                case p_x >= width - num:
                    document.querySelector("html").style.cursor = "ew-resize";
                    direction = "东";
                    break;
                case p_y <= num:
                    document.querySelector("html").style.cursor = "ns-resize";
                    direction = "北";
                    break;
                case p_y >= height - num:
                    document.querySelector("html").style.cursor = "ns-resize";
                    direction = "南";
                    break;
                case num < p_x && p_x < width - num && num < p_y && p_y < height - num:
                    document.querySelector("html").style.cursor = "default";
                    direction = "move";
                    break;
                default:
                    document.querySelector("html").style.cursor = "default";
                    direction = "";
                    break;
            }
    }
    if (changing != null && o_ps.length != 0) {
        var o_e = changing;
        var dx = e.clientX - o_e.clientX,
            dy = e.clientY - o_e.clientY;
        var [ox, oy, ow, oh] = o_ps;
        var p_s;
        switch (direction) {
            case "西北":
                var k = -1 / (oh / ow);
                var d = (k * dx - dy) / Math.sqrt(k ** 2 + 1) + Math.sqrt(ow ** 2 + oh ** 2);
                var w = d * Math.cos(Math.atan(o_ps[3] / o_ps[2]));
                var h = d * Math.sin(Math.atan(o_ps[3] / o_ps[2]));
                p_s = [ox + ow - w, oy + oh - h, w, h];
                break;
            case "东南":
                var k = -1 / (oh / ow);
                var d = -(k * dx - dy) / Math.sqrt(k ** 2 + 1) + Math.sqrt(ow ** 2 + oh ** 2);
                var w = d * Math.cos(Math.atan(o_ps[3] / o_ps[2]));
                var h = d * Math.sin(Math.atan(o_ps[3] / o_ps[2]));
                p_s = [ox, oy, w, h];
                break;
            case "东北":
                var k = 1 / (oh / ow);
                var d = (k * dx - dy) / Math.sqrt(k ** 2 + 1) + Math.sqrt(ow ** 2 + oh ** 2);
                var w = d * Math.cos(Math.atan(o_ps[3] / o_ps[2]));
                var h = d * Math.sin(Math.atan(o_ps[3] / o_ps[2]));
                p_s = [ox, oy + oh - h, w, h];
                break;
            case "西南":
                var k = 1 / (oh / ow);
                var d = -(k * dx - dy) / Math.sqrt(k ** 2 + 1) + Math.sqrt(ow ** 2 + oh ** 2);
                var w = d * Math.cos(Math.atan(o_ps[3] / o_ps[2]));
                var h = d * Math.sin(Math.atan(o_ps[3] / o_ps[2]));
                p_s = [ox + ow - w, oy, w, h];
                break;
            case "西":
                var r = (ow - dx) / ow;
                p_s = [ox + dx, oy, ow - dx, oh * r];
                break;
            case "东":
                var r = (ow + dx) / ow;
                p_s = [ox, oy, ow + dx, oh * r];
                break;
            case "北":
                var r = (o_ps[3] - dy) / oh;
                p_s = [ox, oy + dy, ow * r, oh - dy];
                break;
            case "南":
                var r = (o_ps[3] + dy) / oh;
                p_s = [ox, oy, ow * r, oh + dy];
                break;
            case "move":
                p_s = [ox + dx, oy + dy, ow, oh];
                break;
        }
        el.style.left = p_s[0] + "px";
        el.style.top = p_s[1] + "px";
        el.style.width = p_s[2] + "px";
        el.style.height = p_s[3] + "px";

        if (el.id != "dock") {
            el.querySelector("#tool_bar_c").style.transform = "translateY(0)";

            resize(el, p_s[2] / photos[el.id][2]);
        }
    }
}

// 滚轮缩放
function div_zoom(el, zoom, dx, dy, wheel) {
    var w = photos[el.id][2];
    var h = photos[el.id][3];
    var nw = el.offsetWidth;
    var nh = el.offsetHeight;
    // 以鼠标为中心缩放
    var x = el.offsetLeft + dx - w * zoom * (dx / nw);
    var y = el.offsetTop + dy - h * zoom * (dy / nh);
    var p_s = [x, y, Math.round(w * zoom), Math.round(h * zoom)];
    if (!wheel) {
        el.style.transition = "var(--transition)";
        setTimeout(() => {
            el.style.transition = "";
        }, 400);
    }
    el.style.left = p_s[0] + "px";
    el.style.top = p_s[1] + "px";
    el.style.width = p_s[2] + "px";
    el.style.height = p_s[3] + "px";
}

// 缩放文字实时更新,顶栏大小自适应
function resize(el, zoom) {
    el.querySelector("#size > span").innerHTML = Math.round(zoom * 100);
    var w = el.offsetWidth;
    if (w <= 240) {
        el.querySelector("#tool_bar_c").style.flexDirection = "column";
    } else {
        el.querySelector("#tool_bar_c").style.flexDirection = "";
    }
    if (w <= 100) {
        el.querySelector("#tool_bar_c").style.zoom = "0.3";
    } else if (w <= 130) {
        el.querySelector("#tool_bar_c").style.zoom = "0.4";
    } else if (w <= 300) {
        el.querySelector("#tool_bar_c").style.zoom = "0.5";
    } else if (w <= 340) {
        el.querySelector("#tool_bar_c").style.zoom = "0.6";
    } else if (w <= 380) {
        el.querySelector("#tool_bar_c").style.zoom = "0.7";
    } else if (w <= 420) {
        el.querySelector("#tool_bar_c").style.zoom = "0.8";
    } else if (w <= 500) {
        el.querySelector("#tool_bar_c").style.zoom = "0.9";
    } else {
        el.querySelector("#tool_bar_c").style.zoom = "";
    }
}

var dock_p = store.get("ding_dock");
const dock_el = document.getElementById("dock");
dock_el.style.left = dock_p[0] + "px";
dock_el.style.top = dock_p[1] + "px";

var dock_show = false;
var dock_p_s = [];
dock_el.onclick = () => {
    var dock = dock_el;
    dock_show = !dock_show;
    if (dock_show) {
        dock_p_s = [dock.offsetLeft, dock.offsetTop];
        if (dock.offsetLeft + 5 <= document.querySelector("html").offsetWidth / 2) {
            dock.style.left = "0";
        } else {
            dock.style.left = document.querySelector("html").offsetWidth - 200 + "px";
        }

        dock.className = "dock";
        dock.querySelector("div").style.display = "block";
    } else {
        dock.style.transition = dock.className = "";
        dock.querySelector("div").style.display = "none";
        dock.style.left = dock_p_s[0] + "px";
        dock.style.top = dock_p_s[1] + "px";
    }
};

// 刷新dock
function dock_i() {
    document.querySelector("#dock > div").innerHTML = "";
    for (let o in urls) {
        (function (i) {
            var dock_item = document.querySelector("#dock_item").cloneNode(true) as HTMLElement;
            dock_item.style.display = "block";
            (<HTMLImageElement>dock_item.querySelector("#i_photo")).src = urls[i];
            dock_item.onclick = (e) => {
                let el = e.target as HTMLElement;
                if (el.id != "i_close" && el.id != "i_ignore") {
                    var div = document.getElementById(i);
                    if (div.classList.contains("minimize")) {
                        div.style.transition = "var(--transition)";
                        setTimeout(() => {
                            div.style.transition = "";
                        }, 400);
                        div.classList.remove("minimize");
                    } else {
                        back(div);
                    }
                    div.style.zIndex = String(toppest + 1);
                    toppest += 1;
                }
            };
            const i_close = dock_item.querySelector("#i_close") as HTMLElement;
            i_close.style.display = "block";
            i_close.onclick = () => {
                close(document.getElementById(i));
            };
            const i_ignore = dock_item.querySelector("#i_ignore") as HTMLElement;
            i_ignore.style.display = "block";
            i_ignore.setAttribute("data-ignore", "false");
            var i_ignore_v = false;
            i_ignore.onclick = () => {
                i_ignore_v = !i_ignore_v;
                ignore(document.getElementById(i), i_ignore_v);
            };
            var i_tran_v = false;
            const i_tran = dock_item.querySelector("#i_tran") as HTMLElement;
            i_tran.style.display = "block";
            i_tran.onclick = () => {
                i_tran_v = !i_tran_v;
                transform(document.getElementById(i), i_tran_v);
            };

            document.querySelector("#dock > div").appendChild(dock_item);
        })(o);
    }
}
