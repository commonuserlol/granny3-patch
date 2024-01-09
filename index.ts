import "frida-il2cpp-bridge";
import "frida-java-menu";

let AssemblyCSharp: Il2Cpp.Image | undefined;
let GrannyInstance: Il2Cpp.Object | undefined;
let PlayerInstance: Il2Cpp.Object | undefined;

function coroWorker(coro: Il2Cpp.Object) {
    while (coro.method("MoveNext").invoke()) {}
}

function getAssemblyCSharp() {
    if (AssemblyCSharp) return AssemblyCSharp;
    AssemblyCSharp = Il2Cpp.domain.assembly("Assembly-CSharp").image;
    return AssemblyCSharp;
}

async function getGranny() {
    const klass = AssemblyCSharp!.class("EnemyAIGranny");
    const result = await scan(klass);
    if (result.length > 0)
        GrannyInstance = result[0];
    return GrannyInstance!;
}

async function getPlayer() {
    const klass = AssemblyCSharp!.class("FPSControllerNEW");
    const result = await scan(klass);
    if (result.length > 0)
        PlayerInstance = result[0];
    return PlayerInstance!;
}

async function scan(klass: Il2Cpp.Class): Promise<Il2Cpp.Object[] | []> {
    return new Promise((resolve, _) => {
        const gcresult = Il2Cpp.gc.choose(klass);
        if (gcresult.length > 0) {
            resolve(gcresult);
            return;
        }
        Il2Cpp.memorySnapshot((s) => {
            const obj = s.objects.filter(Il2Cpp.isExactly(klass));
            resolve(obj);
            return "free";
        });
    });
}

const splashScreen = {
    disable() {
        const splashScreenCoro = AssemblyCSharp!.class("splashScreenStart").nested("<readyToStart>d__4");
        splashScreenCoro.method("MoveNext").implementation = function () {
            /*
            iVar1 = this->__1__state;
            if (iVar1 == 2) {
                this->__1__state = -1;
                if ((SceneManager__TypeInfo->_1).cctor_finished_or_no_cctor == 0) {
                    thunk_FUN_00543c4c(SceneManager__TypeInfo,method);
                }
                SceneManager_LoadScene(DAT_0186eee0,(MethodInfo *)0x0);
                return false;
            }
            */
            this.field("<>1__state").value = 2;
            this.method("MoveNext").invoke();
        }
    },
    enable() {
        const splashScreenCoro = AssemblyCSharp!.class("splashScreenStart").nested("<readyToStart>d__4");
        splashScreenCoro.method("MoveNext").revert();
    }
};

// granny
const granny = {
    async setFollowSpeed(instance: Il2Cpp.Object, speed: number) {
        instance.field("grannysFollowSpeed").value = speed;
    },
    stopFollow(instance: Il2Cpp.Object) {
        instance.method("disableHeadFollow").invoke();
    },
    startFollow(instance: Il2Cpp.Object) {
        // need to revert some vars after `stopFollow`
        // ghidra decompiler output:
        /*
        plVar2 = (long *)(*pcStack_30)(pOVar1,uStack_28);
        if (plVar2 != (long *)0x0) {
            (**(code **)(*plVar2 + 0x228))(plVar2,0,*(undefined8 *)(*plVar2 + 0x230));
            this->PlayerEscaped = true;
            this->PlayerDead = true;
            return;
        }
        */
        instance.field("PlayerEscaped").value = false;
        instance.field("PlayerDead").value = false;
        instance.method("followPlayer").invoke();
    },
    // fun
    dropBearTrap(instance: Il2Cpp.Object) {
        const coro = instance.method<Il2Cpp.Object>("dropBearTrap").invoke();
        coroWorker(coro);
    },
    killPlayer(instance: Il2Cpp.Object) {
        const coro = instance.method<Il2Cpp.Object>("Playercaught").invoke();
        coroWorker(coro);
    }
    
};

const player = {
    setForwardSpeed(instance: Il2Cpp.Object, value = 6) {
        instance.field("forwardSpeed").value = value;
    },
    setBackwardSpeed(instance: Il2Cpp.Object, value = 4) {
        instance.field("backwardSpeed").value = value;
    },
    setSidestepSpeed(instance: Il2Cpp.Object, value = 6) {
        instance.field("sidestepSpeed").value = value;
    }

};

const doors = {
    async unlock() {
        const klass = AssemblyCSharp!.class("OpenCloseDoors");
        const instances = await scan(klass);
        for (const instance of instances) {
            const coro = instance.method<Il2Cpp.Object>("timerDoorclosed").invoke();
            coroWorker(coro);
        }
    }
};

function init() {
    try {
        Il2Cpp.perform(getAssemblyCSharp);
    
    const layout = new Menu.ObsidianLayout();
    const composer = new Menu.Composer("Granny3 hack", "https://github.com/commonuserlol/granny3-hack", layout);
    composer.icon("https://i.pinimg.com/originals/9d/5d/fc/9d5dfcec8e9ac17bfabb8bdbca1aa64e.jpg", "Web");

    Menu.add(layout.toggle("Disable start splash screen", (state: boolean) => {
        Il2Cpp.perform(() => {
            state ? splashScreen.disable() : splashScreen.enable();
        });
    }));
    
    const general = layout.textView("<b>--- GENERAL ---</b>");
    general.gravity = Menu.Api.CENTER;

    Menu.add(general);

    Menu.add(layout.button("Unlock all doors", () => doors.unlock()));
    Menu.add(layout.seekbar("Player forward speed: {0} / 100", 100, 0, (progress: number) => {
        getPlayer().then(p => player.setForwardSpeed(p, progress));
    }));
    Menu.add(layout.seekbar("Player backward speed: {0} / 100", 100, 0, (progress: number) => {
        getPlayer().then(p => player.setBackwardSpeed(p, progress));
    }));
    Menu.add(layout.seekbar("Player side step speed: {0} / 100", 100, 0, (progress: number) => {
        getPlayer().then(p => player.setSidestepSpeed(p, progress));
    }));

    const grannyText = layout.textView("<b>--- GRANNY ---</b>");
    grannyText.gravity = Menu.Api.CENTER; 
    Menu.add(grannyText);

    Menu.add(layout.seekbar("Speed: {0} / 100", 100, 0, (progress: number) => {
        getGranny().then(g => granny.setFollowSpeed(g, progress / 10));
    }));

    Menu.add(layout.button("Stop follow player", () => {
        getGranny().then(g => granny.stopFollow(g));
    }));

    Menu.add(layout.button("Start follow player", () => {
        getGranny().then(g => granny.startFollow(g));
    }));

    Menu.add(layout.button("Drop bear trap (DO NOT SPAM)", () => {
        getGranny().then(g => granny.dropBearTrap(g));
    }));

    Menu.add(layout.button("Kill player", () => {
        getGranny().then(g => granny.killPlayer(g));
    }));


    composer.show();
    }
    catch (e) {
        console.log(e.stack);
    }
}

var android_log_write = new NativeFunction(
    Module.getExportByName(null, '__android_log_write'),
    'int',
    ['int', 'pointer', 'pointer']
);
var tag = Memory.allocUtf8String("frida");
console.log = function(str) {
    android_log_write(3, tag, Memory.allocUtf8String(str));
}

Menu.waitForInit(init);

globalThis.splashScreen = splashScreen;
globalThis.granny = granny;
globalThis.doors = doors;
globalThis.player = player;