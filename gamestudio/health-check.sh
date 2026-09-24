#!/bin/bash
# Прибор здоровья машины и хозяйства. Запускается НЕ каждый круг (§14а).
#
# ЗАЧЕМ ОН ЕСТЬ. 10 августа 2026 шестнадцать осиротевших процессов
# `node -e 'for(;;);'` жгли двенадцать ядер 18 часов подряд. `usage-snapshot.sh`
# всё это время честно печатал «МАШИНА ПЕРЕГРУЖЕНА: волну не расширять», и я
# 18 часов подчинялся: сокращал волну, не запускал роли, объяснял владельцу
# перегрузку. Нагрузка была НЕ НАША. Находка Г-22.
#
# ЧЕГО НЕ ХВАТАЛО. Не числа — число было верным. Не хватало ВОПРОСА: чья это
# нагрузка и сколько ей лет. «load высокий» и «наши воркеры перегрузили машину» —
# два разных утверждения, и я читал первое как второе. Поэтому прибор печатает не
# вердикт, а ИМЕНА и ВОЗРАСТ: осиротевший долгожитель виден глазом сразу.
#
# ПОЧЕМУ НЕ КАЖДЫЙ КРУГ. Такие поломки живут часами, а не минутами; проверять их
# каждые 15 минут — тратить круг на то, что не меняется. Но проверять их НАДО
# прежде, чем объяснить машиной замедление или сокращение волны: иначе вердикт
# опирается на чужие процессы.
#
# `etimes` на macOS МОЛЧА выпадает из вывода `ps` — колонки съезжают, и скрипт
# врёт, не падая. Поэтому берём `etime` и разбираем формат [[dd-]hh:]mm:ss сами.
set -u

# ── ИМЯ ИНТЕРПРЕТАТОРА РАЗРЕШАЕТСЯ ПО РАБОТОСПОСОБНОСТИ, А НЕ ПО НАЛИЧИЮ ──────
# `command -v python3` здесь не годится: в Windows лежит заглушка из Microsoft
# Store по пути WindowsApps/python3 — она НАХОДИТСЯ, печатает «Python» и выходит
# с кодом 49, ничего не исполнив. Прибор при этом не падает, а молча печатает
# мусор: 23.09.2026 usage-snapshot.sh выдал одно слово «Python» вместо снимка
# лимитов, и три прибора студии на этой машине не работали вовсе.
# Поэтому кандидаты ПРОБУЮТСЯ: годен тот, кто реально исполнил пустую программу.
PY=""
for _c in python3 python py; do
  if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "" >/dev/null 2>&1; then PY="$_c"; break; fi
done
if [ -z "$PY" ]; then
  echo "не нашёл работающий python (пробовал python3, python, py)" >&2
  exit 2
fi

cd "$(dirname "$0")/.." || exit 1

# ── ПРОФИЛЬ ПРОЕКТА ЧИТАЕТСЯ ДО ПЕРВОГО РАЗДЕЛА ───────────────────────────────
# Раньше `.studio/project.conf` читался в §2а, и разделы 5 и 8 до него не
# доставали: они сравнивали ветки с литералом `main`. Ствол этого проекта —
# `dnd-app`, поэтому 23.09.2026 прибор напечатал «РАБОТА БЕЗ ИСПОЛНИТЕЛЯ:
# dnd-app — 587 коммитов ждут стадии», то есть объявил бесхозной работой весь
# проект разом. Имя ствола — проектное знание, ему место в профиле, а не в
# переносимой студии; умолчание остаётся `main`.
[ -f .studio/project.conf ] && . .studio/project.conf
TRUNK="${TRUNK_BRANCH:-main}"

# Десятичный разделитель. Под русской локалью и awk, и PowerShell печатают
# «96,9»; `sort -rn` и сравнение `$4 > 20` читают такое число как 96. Проценты
# здесь выносят вердикт, поэтому точка назначается явно.
export LC_NUMERIC=C

# ── ПЛАТФОРМА ОПРЕДЕЛЯЕТСЯ ПО `uname`, А НЕ ПО НАЛИЧИЮ КОМАНД ────────────────
# Разница не теоретическая. `uptime` и `sysctl -n hw.ncpu` — команды macOS; в
# Git Bash их нет, и раздел 1 до 24.09.2026 печатал «load average 1 мин:  на 1
# ядрах» — пустую строку от `uptime` и единицу из `|| echo 1`. Отсутствие
# команды прошло молча ровно потому, что само отсутствие и было проверкой.
case "$(uname -s 2>/dev/null)" in
  Darwin)               PLATFORM=macos ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM=windows ;;
  Linux)                PLATFORM=linux ;;
  *)                    PLATFORM=unknown ;;
esac

problems=0
blind=0

# ── ГЛАВНОЕ ПРАВИЛО ЭТОГО ПРИБОРА, ОПЛАЧЕННОЕ ДОРОГО ────────────────────────
# 23.09.2026 Producer доложил владельцу «чужих процессов не осталось», опираясь
# на пустой список из `ps` Git Bash: тот видит только процессы MSYS, а не
# Windows. Через час нашлось, что прибор не видит и самого приложения —
# `dnd-master.exe` работал с PID 25252. Пустоту прочли как ноль, ноль — как
# чистоту, и слепота прибора стала ложным утверждением владельцу.
# Поэтому раздел, который не смог измерить, говорит об этом вслух и НЕ печатает
# цифр. Ноль, означающий «не проверено», хуже пустоты.
cannot() {
  echo "НЕ ИЗМЕРЕНО: $*"
  blind=$((blind + 1))
}

echo "═══ здоровье машины и хозяйства ═══"
echo "платформа: $PLATFORM"

# ── ОДНА ТАБЛИЦА ПРОЦЕССОВ НА РАЗДЕЛЫ 1, 2, 2а И 3 ──────────────────────────
# Развилка по платформе сделана только в ДОБЫЧЕ. Пороги, признаки и вердикты
# ниже общие: разведи их по платформам — и через месяц это будут два прибора с
# разными числами, о чём никто не узнает, пока один из них не соврёт.
#
# Колонки (разделитель — TAB):
#   1 pid  2 ppid  3 возраст_с  4 %CPU_за_жизнь  5 сирота  6 класс
#   7 возраст_строкой  8 имя_образа  9 команда (последняя: в ней есть пробелы)
#
# 4 — СРЕДНЕЕ за жизнь процесса, а не мгновенное, и на обеих платформах это
#   одна и та же величина, а не две похожие:
#     macOS   — `pcpu` из `ps`, то есть время ЦП, делённое на возраст;
#     Windows — (KernelModeTime + UserModeTime) / возраст, считается здесь.
#   Поэтому порог «больше 20 %» из §2 переносится на Windows без пересчёта.
#   `Get-Process`.CPU для этого НЕ годился бы: это секунды, а не проценты, и
#   сравнивать их с порогом 20 — сравнивать секунды с долей. Времена берутся из
#   того же Win32_Process, что и остальные поля: они есть у всех процессов, в
#   том числе у чужих, тогда как `Get-Process`.CPU на этой машине молчал у 139
#   процессов из 311 (замер 24.09.2026).
# 5 — сирота: macOS — ppid 1; Windows — родителя нет в таблице ЛИБО родитель
#   МОЛОЖЕ ребёнка. Второе условие обязательно: Windows переиспользует номера
#   PID, и свежий чужой процесс с номером умершего родителя выдал бы сироту за
#   живого сына.
# 6 — класс: 0 обычный, 1 системный демон (исключён из охоты за сиротами),
#   2 НЕ РАЗОБРАН — ни пути, ни строки запуска. Третий класс тоже про честность:
#   под Windows без прав администратора строка запуска чужих процессов и SYSTEM
#   не читается вовсе, и молча считать такой процесс «не системным» значит
#   гадать. Их количество печатается, а в сироты они не записываются.
PROC=""
PROC_WHY=""
win_cores=""; win_load=""; win_total=""; win_hidden=""

# Интерпретатор PowerShell разрешается ПРОБОЙ, как и python выше: Windows умеет
# подсовывать заглушки, которые находятся и ничего не исполняют.
PS_EXE=""
if [ "$PLATFORM" = windows ]; then
  for _c in powershell.exe pwsh.exe powershell pwsh; do
    command -v "$_c" >/dev/null 2>&1 || continue
    if [ "$("$_c" -NoProfile -NonInteractive -Command 'Write-Output ok' 2>/dev/null | tr -d '\r\n')" = "ok" ]; then
      PS_EXE="$_c"; break
    fi
  done
fi

# Сборщик под Windows. Один запуск PowerShell на весь прибор (он стоит ~2 с),
# один запрос Win32_Process на все четыре раздела.
# Передаётся через -EncodedCommand (UTF-16LE + base64), а не строкой в кавычках
# и не временным файлом: кавычки и обратные косые в PowerShell-коде иначе
# пришлось бы экранировать дважды — сначала для bash, потом для PowerShell, —
# а временный файл требует `cygpath` и разрешения на исполнение скриптов.
win_proc_src() {
  cat <<'PSEOF'
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$cores = 0
try { $cores = [int](Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors } catch {}
if ($cores -le 0) { try { $cores = [int]$env:NUMBER_OF_PROCESSORS } catch { $cores = 0 } }
$load = ''
try {
  $l = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
  if ($l -ne $null) { $load = [int]$l }
} catch {}
$procs = @()
try { $procs = @(Get-CimInstance Win32_Process) } catch {}
$born = @{}
$parent = @{}
foreach ($p in $procs) {
  $born[[int]$p.ProcessId] = $p.CreationDate
  $parent[[int]$p.ProcessId] = [int]$p.ParentProcessId
}
$selfShell = -1
if ($parent.ContainsKey($PID)) { $selfShell = $parent[$PID] }
$now = Get-Date
$hidden = 0
$out = New-Object System.Text.StringBuilder
foreach ($p in $procs) {
  $id = [int]$p.ProcessId
  if ($id -le 4) { continue }
  if ($id -eq $PID -or $id -eq $selfShell) { continue }
  $cd = $p.CreationDate
  if ($cd -eq $null) { $age = -1 } else { $age = [int]((New-TimeSpan -Start $cd -End $now).TotalSeconds) }
  $cpu = -1
  if ($p.KernelModeTime -ne $null -and $p.UserModeTime -ne $null) {
    $cpu = [int](([double]$p.KernelModeTime + [double]$p.UserModeTime) / 1e7)
  }
  $pp = [int]$p.ParentProcessId
  $orph = 1
  if ($born.ContainsKey($pp) -and $cd -ne $null -and $born[$pp] -ne $null -and $born[$pp] -le $cd) { $orph = 0 }
  $path = $p.ExecutablePath
  if ([string]::IsNullOrWhiteSpace($path)) { $path = '' }
  $cmd = $p.CommandLine
  if ([string]::IsNullOrWhiteSpace($cmd)) { $cmd = '' }
  $cls = 0
  if ($path -ne '' -and $path -like "$env:SystemRoot\*") { $cls = 1 }
  if ($path -eq '' -and $cmd -eq '') { $cls = 2; $hidden++ }
  $line = ($path + ' ' + $cmd).Trim()
  if ($line -eq '') { $line = [string]$p.Name }
  $line = ($line -replace "[`t`r`n]", ' ') -replace '\\', '/'
  $nm = ([string]$p.Name -replace "[`t`r`n]", ' ')
  if ($nm -eq '') { $nm = '?' }
  [void]$out.AppendLine("$id`t$pp`t$age`t$cpu`t$orph`t$cls`t$nm`t$line")
}
"#meta`t$cores`t$load`t$($procs.Count)`t$hidden"
[Console]::Out.Write($out.ToString())
PSEOF
}

# Возраст печатается в формате `ps` ([[dd-]hh:]mm:ss) на обеих платформах —
# иначе два прибора, читаемые одним человеком, называют одно и то же по-разному.
# Путь к временному файлу держится ОТДЕЛЬНО от «таблица годна»: ниже `PROC`
# обнуляется, если таблица пустая, и уборка по этому имени промахнулась бы мимо
# файла, который сама же и создала.
PROC_TMP=$(mktemp "${TMPDIR:-/tmp}/health-proc.XXXXXX" 2>/dev/null) || PROC_TMP=""
PROC="$PROC_TMP"
if [ -n "$PROC" ]; then
  trap 'rm -f "$PROC_TMP" "$PROC_TMP.raw"' EXIT
  case "$PLATFORM" in
    macos|linux)
      ps -eo pid,ppid,etime,pcpu,args 2>/dev/null | tail -n +2 | awk '
        {
          pid=$1; ppid=$2; et=$3; cpu=$4;
          d=0; rest=et;
          if (rest ~ /-/) { split(rest,a,"-"); d=a[1]; rest=a[2] }
          n=split(rest,t,":");
          if (n==3) secs=t[1]*3600+t[2]*60+t[3]; else if (n==2) secs=t[1]*60+t[2]; else secs=-1;
          if (secs>=0) secs+=d*86400;
          $1=$2=$3=$4=""; sub(/^ +/,""); cmd=$0;
          cls = (cmd ~ /^\/System\// || cmd ~ /^\/usr\// || cmd ~ /^\/sbin\// || cmd ~ /^\/Library\//) ? 1 : 0;
          orph = (ppid==1) ? 1 : 0;
          # Имя образа: последний кусок пути до первого пробела. У macOS-бандлов
          # с пробелом в пути («/Applications/Google Chrome.app/…») это даст
          # обрезанное имя — колонка нужна для группировки своих, и такой
          # промах виден глазом, в отличие от молчаливого нуля.
          tok=cmd; sub(/ .*$/, "", tok); k=split(tok, seg, "/"); nm=seg[k];
          if (nm == "") nm="?";
          printf "%s\t%s\t%d\t%.1f\t%d\t%d\t%s\t%s\t%s\n", pid, ppid, secs, cpu, orph, cls, et, nm, cmd;
        }' > "$PROC" 2>/dev/null
      [ -s "$PROC" ] || PROC_WHY="ps -eo не вернул ни строки"
      ;;
    windows)
      if [ -z "$PS_EXE" ]; then
        PROC_WHY="рабочего PowerShell нет (пробовал powershell.exe, pwsh.exe)"
      else
        enc=$(win_proc_src | iconv -f UTF-8 -t UTF-16LE 2>/dev/null | base64 -w0 2>/dev/null)
        if [ -z "$enc" ]; then
          PROC_WHY="не собрал -EncodedCommand (нет iconv или base64)"
        else
          "$PS_EXE" -NoProfile -NonInteractive -EncodedCommand "$enc" 2>/dev/null | tr -d '\r' > "$PROC_TMP.raw"
          meta=$(grep -m1 '^#meta' "$PROC_TMP.raw" 2>/dev/null)
          if [ -z "$meta" ]; then
            PROC_WHY="PowerShell не вернул таблицу процессов (Win32_Process недоступен?)"
          else
            win_cores=$(printf '%s' "$meta" | cut -f2)
            win_load=$(printf '%s' "$meta" | cut -f3)
            win_total=$(printf '%s' "$meta" | cut -f4)
            win_hidden=$(printf '%s' "$meta" | cut -f5)
            grep -v '^#meta' "$PROC_TMP.raw" | awk -F'\t' '
              NF >= 8 {
                age=$3+0; cpu=$4+0;
                pct = (age > 0 && cpu >= 0) ? cpu * 100.0 / age : -1;
                if (age < 0) { as="?" }
                else {
                  d=int(age/86400); r=age%86400; h=int(r/3600); m=int((r%3600)/60); s=r%60;
                  if (d > 0)      as=sprintf("%d-%02d:%02d:%02d", d, h, m, s);
                  else if (h > 0) as=sprintf("%02d:%02d:%02d", h, m, s);
                  else            as=sprintf("%02d:%02d", m, s);
                }
                printf "%s\t%s\t%d\t%.1f\t%d\t%d\t%s\t%s\t%s\n", $1, $2, age, pct, $5, $6, as, $7, $8;
              }' > "$PROC" 2>/dev/null
            [ -s "$PROC" ] || PROC_WHY="PowerShell вернул заголовок, но ни одной строки процесса"
          fi
        fi
      fi
      ;;
    *)
      PROC_WHY="платформа '$(uname -s 2>/dev/null)' прибору незнакома"
      ;;
  esac
else
  PROC_WHY="не завёлся временный файл (mktemp)"
fi
[ -n "$PROC" ] && [ -s "$PROC" ] || PROC=""

# ── 1. Кто держит машину: имена и возраст, а не только load ────────────────────
load1=""
load_pct=""
cores=""
echo
case "$PLATFORM" in
  macos|linux)
    load1=$(uptime 2>/dev/null | sed 's/.*averages*: *//' | awk '{print $1}')
    if [ "$PLATFORM" = macos ]; then
      cores=$(sysctl -n hw.ncpu 2>/dev/null)
    else
      cores=$(nproc 2>/dev/null)
    fi
    # Прежнее `|| echo 1` выдавало единицу за измерение; на Windows именно оно и
    # печатало «на 1 ядрах» двенадцатиядерной машине.
    if [ -n "$load1" ] && [ -n "$cores" ]; then
      echo "load average 1 мин: $load1 на $cores ядрах"
    else
      cannot "загрузку машины: uptime/sysctl не ответили — числа вместо них не придумываем"
    fi
    ;;
  windows)
    [ -n "$win_cores" ] && [ "$win_cores" -gt 0 ] 2>/dev/null && cores="$win_cores"
    [ -z "$cores" ] && cores="${NUMBER_OF_PROCESSORS:-}"
    if [ -n "$win_load" ] && [ -n "$cores" ]; then
      load_pct="$win_load"
      echo "мгновенная загрузка ЦП: $load_pct % на $cores ядрах"
      # ЭТО ДРУГАЯ ВЕЛИЧИНА, И ПОДПИСЬ ОБЯЗАТЕЛЬНА. load average — средняя ДЛИНА
      # ОЧЕРЕДИ к ядрам за минуту, она бывает и 40 при 12 ядрах. LoadPercentage —
      # доля занятых ядер ПРЯМО СЕЙЧАС, потолок 100 %.
      echo "  это НЕ load average: доля занятых ядер СЕЙЧАС, потолок 100 %, очереди не видно."
      echo "  Порог «load/ядра ≥ 4» из usage-snapshot.sh к этому числу НЕПРИМЕНИМ:"
      echo "  ровно занятая машина и очередь из сорока задач дают одинаковые 100 %."
    elif [ -n "$cores" ]; then
      cannot "мгновенную загрузку ЦП (Win32_Processor.LoadPercentage не ответил); ядер: $cores"
    else
      cannot "ни загрузку, ни число ядер: PowerShell не ответил"
    fi
    ;;
  *)
    cannot "загрузку машины: платформа прибору незнакома"
    ;;
esac

# %CPU здесь — СРЕДНЕЕ ЗА ВСЮ ЖИЗНЬ процесса, а не мгновенное. Подпись обязательна:
# 11 августа 2026 я, автор этого предупреждения, прочитал «111 %, возраст двое суток»
# как утечку через двенадцать часов после того, как сам записал оговорку в комментарий
# ниже. Комментарий читает тот, кто правит скрипт; строку — тот, кто принимает решение.
if [ -n "$PROC" ]; then
  echo "верхние пять по СРЕДНЕМУ CPU ЗА ВСЮ ЖИЗНЬ процесса (не мгновенному!):"
  echo "  у долгожителя это число размазано: 100 % за двое суток и 100 % за минуту — разные вещи"
  sort -t"$(printf '\t')" -k4,4rn "$PROC" | head -5 |
    awk -F'\t' '{ printf "  %6.1f%%  возраст %-12s ppid %-6s %s\n", $4, $7, $2, substr($9, 1, 72) }'
  if [ "$PLATFORM" = windows ] && [ -n "$win_hidden" ] && [ "$win_hidden" -gt 0 ] 2>/dev/null; then
    echo "  строка запуска не читается у $win_hidden процессов из $win_total (чужой пользователь"
    echo "  или SYSTEM — нужны права администратора): они здесь только по имени файла"
  fi
else
  cannot "кто держит машину: таблица процессов не собрана — $PROC_WHY"
fi

# ── 2. Осиротевшие долгожители, жгущие CPU — случай Г-22 ───────────────────────
# Признак утечки: родителя нет + старше часа + больше 20 % CPU.
# Каждое условие по отдельности законно: у демонов ppid 1, сборка живёт долго,
# тест ест CPU. Втроём они не встречаются у работы, только у забытого процесса.
#
# СИСТЕМНЫЕ ДЕМОНЫ ИСКЛЮЧЕНЫ, И БЕЗ ЭТОГО ПРИБОР БЕСПОЛЕЗЕН: WindowServer,
# CoreServices и duetexpertd подходят под все три условия всегда — ppid 1, живут
# с загрузки, считают проценты за двенадцать суток. В первом прогоне они дали три
# ложных срабатывания из трёх, то есть спрятали бы настоящую утечку в шуме.
# На Windows ту же роль играют службы из %SystemRoot%: их отсекает класс 1.
#
# ВАЖНО ПРО %CPU: это средняя загрузка ЗА ВСЮ ЖИЗНЬ процесса, а не мгновенная.
# У долгожителя она размазана, у свежего — почти мгновенная. Поэтому число здесь
# признак, а не мера: смотреть надо на тройку условий вместе.
leaks=""
unparsed=0
if [ -n "$PROC" ]; then
  leaks=$(awk -F'\t' '$6 == 0 && $5 == 1 && $3 > 3600 && $4 > 20 {
            printf "  %6.1f%%  возраст %-12s %s\n", $4, $7, substr($9, 1, 66) }' "$PROC")
  unparsed=$(awk -F'\t' '$6 == 2' "$PROC" | grep -c .)
fi

# ── 2а. ЧЬЯ нагрузка: доля наших процессов в верхних десяти по CPU ─────────────
# Прибор отвечал на вопрос «есть ли утечка», а решение принимается по другому
# вопросу: «наша ли это нагрузка». 11 августа 2026 верхние строки держали
# MediaAnalysis (83 % четыре часа), syspolicyd и WindowServer — Apple, — а я
# несколько кругов подряд не расширял волну, ссылаясь на load 50. Ровно ошибка
# Г-22, но в новом виде: тогда чужие процессы были осиротевшими, теперь они
# системные и законные. Утечкой не является ни то, ни другое; на волну не влияет
# ни то, ни другое.
#
# ПОЧЕМУ ШАБЛОН ИМЕННО ТАКОЙ. Путь worktree в аргументах агента не виден — там
# только `claude ... --model X --effort Y`, а рабочий каталог `ps` не печатает.
# Отличаем воркера от СВОЕЙ сессии координатора по флагу `--model`: воркер всегда
# запускается с ним (`worker-start --model`), координатор — без. Первый прогон
# этой строки насчитал «0 из 10», когда вторую строку держал живой воркер.
# Признак «процесс наш» задаёт проект: OURS_RE в `.studio/project.conf`.
# Умолчание покрывает деревья Orca и агентов; на другом движке допиши свои
# имена сборщика и раннера, иначе прибор посчитает чужую нагрузку своей.
#
# НА WINDOWS ШАБЛОН РАБОТАЕТ БЕЗ ПРАВКИ, и это не совпадение: в колонке команды
# лежит ExecutablePath ПЛЮС строка запуска, а обратные косые заменены на прямые.
# Поэтому `orca/workspaces` находит и `dnd-master.exe`, собранный в дереве
# воркера, хотя сам он запускается относительным путём `target/debug/...`.
OURS_RE="${OURS_RE:-orca/workspaces|$(basename "$PWD")|vite-node|vitest|puppeteer|dotnet|godot|claude .*--model|codex}"
echo
if [ -n "$PROC" ]; then
  top_cpu=$(awk -F'\t' '$4 >= 0' "$PROC" | sort -t"$(printf '\t')" -k4,4rn | head -10)
  top_n=$(printf '%s\n' "$top_cpu" | grep -c .)
  ours=$(printf '%s\n' "$top_cpu" | cut -f9 | grep -cE "$OURS_RE")
  echo "из верхних $top_n по CPU НАШИХ: $ours из $top_n"
  if [ "$ours" -le 2 ]; then
    echo "  Нагрузку держат НЕ наши процессы. Сокращать волну по этой загрузке — значит"
    echo "  подчиняться чужому расходу: смотри верхние пять выше по именам."
  fi
  # ДОЛЯ ОТВЕЧАЕТ НА ОДИН ВОПРОС, А СПРАШИВАЮТ ДВА. «Сколько наших в верхних
  # десяти» решает судьбу волны, но 23.09.2026 Producer пришёл с другим: не
  # остались ли процессы от снятых деревьев. На этот вопрос счёт не отвечает —
  # нужны ИМЕНА, и именно их не хватило, чтобы заметить живой `dnd-master.exe`
  # с PID 25252.
  #
  # ГРУППИРОВКА ПО ИМЕНИ ОБРАЗА, А НЕ ВЕРХУШКА СПИСКА. Простаивающее окно
  # приложения в верхние пять по CPU не попадает никогда — оно почти не ест
  # процессор, — а спрашивают именно про него. Список, обрезанный по CPU или по
  # возрасту, спрятал бы `dnd-master.exe` тем же способом, каким его прятал `ps`,
  # только теперь «законно». Имён же немного, и они влезают целиком.
  ours_n=$(awk -F'\t' -v re="$OURS_RE" '$9 ~ re' "$PROC" | grep -c .)
  if [ "$ours_n" -gt 0 ]; then
    echo "наших процессов на машине: $ours_n — по именам образов:"
    awk -F'\t' -v re="$OURS_RE" '
      $9 ~ re { n[$8]++; if ($3 + 0 > a[$8]) { a[$8] = $3 + 0; s[$8] = $7 } }
      END {
        for (k in n) printf "%d\t  %-26s ×%-3d %s %s\n",
          a[k], k, n[k], (n[k] == 1 ? "возраст " : "старшему"), s[k]
      }' "$PROC" | sort -rn | cut -f2-
  else
    echo "наших процессов на машине не видно ни одного (признак «наш» — OURS_RE)"
  fi
else
  # Пустой список даёт `grep -c` ноль, и раньше он печатался как «0 из 10» —
  # число, выдуманное из пустоты. Оно и стоило владельцу ложного доклада.
  cannot "чья нагрузка: без таблицы процессов это не ноль наших, а неизвестность"
fi

echo
if [ -z "$PROC" ]; then
  cannot "осиротевших долгожителей: перебирать нечего — $PROC_WHY"
elif [ -n "$leaks" ]; then
  echo "УТЕЧКА: осиротевшие процессы старше часа жгут больше 20 % CPU."
  echo "$leaks"
  echo "  Это НЕ работа воркеров. Прежде чем сокращать волну — сними их и померь заново."
  problems=$((problems + 1))
else
  echo "осиротевших долгожителей, жгущих CPU, нет"
fi
if [ -n "$PROC" ] && [ "$unparsed" -gt 0 ]; then
  echo "  среди них не искали $unparsed процессов без пути и строки запуска:"
  echo "  системный это демон или забытая работа — без прав администратора не видно"
fi

# ── 3. Брошенные браузеры от съёмки кадров ────────────────────────────────────
# `npm run shots` сам сообщает «закрытие браузера не уложилось в 60000 мс —
# Chromium снят SIGKILL». Снятый по SIGKILL браузер оставляет живых детей.
#
# СЧИТАЕМ ТОЛЬКО СВОИ. Первый прогон насчитал 23 «браузера от съёмки» — это был
# обычный Chrome владельца со своими вкладками-помощниками. Признак съёмочного:
# `--headless` либо путь внутри наших worktree'ев. Без этого прибор пугает тем,
# что трогать нельзя.
#
# СУДИМ ПО ВОЗРАСТУ, А НЕ ПО НАЛИЧИЮ. Второй прогон прибора насчитал 21
# «брошенный» браузер — им было по 10 СЕКУНД: воркер снимал кадры прямо сейчас.
# Прибор, который кричит на идущую работу, перестают читать. Съёмка стоит 70–135 с,
# поэтому живой процесс СТАРШЕ ДЕСЯТИ МИНУТ — это уже остаток, а не работа.
echo
if [ -z "$PROC" ]; then
  cannot "брошенные съёмочные браузеры: перебирать нечего — $PROC_WHY"
else
  shots=$(awk -F'\t' 'tolower($9) ~ /chrom(e|ium)/ && $9 ~ /--headless|orca\/workspaces|puppeteer/' "$PROC")
  chr=$(printf '%s\n' "$shots" | awk -F'\t' 'NF >= 8 && $3 > 600' | grep -c .)
  young=$(printf '%s\n' "$shots" | grep -c .)
  if [ "$chr" -gt 0 ]; then
    echo "съёмочных браузеров СТАРШЕ 10 МИНУТ: $chr — съёмка столько не идёт, это остатки SIGKILL"
    problems=$((problems + 1))
  elif [ "$young" -gt 0 ]; then
    echo "съёмочных браузеров живо: $young, все моложе 10 минут — съёмка идёт, это работа"
  else
    echo "брошенных съёмочных браузеров нет"
  fi
fi

# ── 4. Место на диске: каждый worktree несёт свой node_modules ────────────────
avail_kb=$(df -k . | tail -1 | awk '{print $4}')
avail_gb=$((avail_kb / 1048576))
wt=$(git worktree list 2>/dev/null | wc -l | tr -d ' ')
echo
echo "свободно $avail_gb ГБ; worktree'ев (включая главное дерево): $wt"
if [ "$avail_gb" -lt 15 ]; then
  echo "  МЕСТА МАЛО: свежий worktree ставит свой node_modules, и воркер молча встанет на install"
  problems=$((problems + 1))
fi

# ── 5. Worktree без живой задачи ──────────────────────────────────────────────
# Слитая ветка со своим деревом — это гигабайты node_modules и лишние строки в
# work-check.sh. Принадлежность стволу проверяем `merge-base --is-ancestor`:
# `git branch --merged` 10 августа 2026 соврал на всех пяти проверенных ветках.
#
# «ПРЕДОК СТВОЛА» — ЭТО ДВА РАЗНЫХ СОСТОЯНИЯ, И ПУТАТЬ ИХ ОПАСНО. Первый прогон
# прибора предложил снять дерево ЖИВОГО воркера M5-20: его ветка ещё не имела ни
# одного коммита, стояла ровно на вершине ствола — и формально была его предком.
# Отличаем по вершине: у слитой ветки вершина СТРОГО ПОЗАДИ ствола, у только что
# созданной — РАВНА ему. Второй страж — грязное дерево: воркер в работе.
#
# ТРЕТИЙ СТРАЖ, И ОН ЕДИНСТВЕННЫЙ НАСТОЯЩИЙ: живая задача на дереве. Сравнение
# вершин не покрывает случай «ветка без коммитов, а ствол уехал вперёд» — тогда
# вершина формально ПОЗАДИ ствола, дерево чистое, и прибор второй раз за сутки
# предложил снять дерево работающего воркера (11 августа — ui-three-bugs, до
# этого M5-20). Отличить слитую ветку от свежей по одному git невозможно: у обеих
# вершина лежит в истории ствола. Спрашиваем оркестратор, кто занят.
#
# СТВОЛ НЕ ВСЕГДА `main`, И ВШИТОЕ ИМЯ ЗДЕСЬ — ТА ЖЕ ЛОЖЬ ПО ПУСТОТЕ. Если
# ветки `main` в репозитории нет, `merge-base --is-ancestor` молча падает на
# каждой ветке, `continue` съедает все, и раздел печатает «деревьев от слитых
# веток нет» — приговор по пустому перебору. Имя ствола берётся из профиля
# (TRUNK_BRANCH), а его отсутствие называется вслух.
echo
trunk_ok=0
git rev-parse --verify --quiet "refs/heads/$TRUNK" >/dev/null 2>&1 && trunk_ok=1
if [ "$trunk_ok" != 1 ]; then
  cannot "деревья слитых веток: ствол '$TRUNK' в репозитории не найден (TRUNK_BRANCH в .studio/project.conf)"
else
  live_wt=$(orca orchestration worker-list --json 2>/dev/null | "$PY" -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
for w in (d.get('result',{}).get('workers') or []):
    if w.get('dispatchStatus') == 'dispatched':
        print(w.get('resource',{}).get('worktreeId','').split('/')[-1])
" 2>/dev/null)
  trunk_tip=$(git rev-parse "$TRUNK" 2>/dev/null)
  landed=""
  fresh=""
  while read -r _ path; do
    [ -z "$path" ] && continue
    b=$(basename "$path")
    git show-ref --verify --quiet "refs/heads/$b" 2>/dev/null || continue
    git merge-base --is-ancestor "$b" "$TRUNK" 2>/dev/null || continue
    # Живая задача на дереве — не трогать, что бы ни говорила вершина.
    if printf '%s\n' "$live_wt" | grep -qx "$b" 2>/dev/null; then fresh="$fresh $b(задача)"; continue; fi
    tip=$(git rev-parse "$b" 2>/dev/null)
    if [ "$tip" = "$trunk_tip" ]; then fresh="$fresh $b"; continue; fi
    # Грязное дерево — воркер работает между коммитами, не трогать.
    if [ -n "$(git -C "$path" status --short 2>/dev/null)" ]; then fresh="$fresh $b"; continue; fi
    landed="$landed $b"
  done < <(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{print "wt", $2}')
  if [ -n "$landed" ]; then
    echo "деревья веток, ЛЕЖАЩИХ В СТВОЛЕ ($TRUNK) — кандидаты на orca worktree rm:"
    for b in $landed; do echo "  $b"; done
    echo "  Проверь по task-list, что на ветке нет живой задачи: вершина позади ствола"
    echo "  и чистое дерево не доказывают, что воркер ушёл."
    problems=$((problems + 1))
  else
    echo "деревьев от слитых веток нет (ствол: $TRUNK)"
  fi
  if [ -n "$fresh" ]; then
    echo "не тронуты намеренно (вершина = ствол либо дерево грязное, то есть работа идёт):"
    for b in $fresh; do echo "  $b"; done
  fi
fi

# ── 6. Незакоммиченные спеки в стволе ────────────────────────────────────────
# Воркер видит только закоммиченное. Спека, лежащая в главном дереве грязной,
# в свежий worktree не приезжает вовсе — и задача уходит без задания.
dirty=$(git status --short -- docs/plan 2>/dev/null | wc -l | tr -d ' ')
echo
if [ "$dirty" -gt 0 ]; then
  echo "НЕЗАКОММИЧЕННЫХ файлов в docs/plan: $dirty — воркер их не увидит"
  git status --short -- docs/plan | head -5 | sed 's/^/  /'
  problems=$((problems + 1))
else
  echo "спеки в docs/plan закоммичены"
fi

# ── 7. Воркер запущен и НЕ НАЧАТ ─────────────────────────────────────────────
# Отказ, стоивший трёх случаев по два-три часа каждый (11 августа: ui-three-bugs,
# codex на обрамлении, review-cut). Спека уходит в поле ввода и там остаётся:
# Orca показывает `dispatched`, процесс жив, биения идут, `worker-read` отдаёт
# текст задания — и ни одной строки работы. Глазами это не ловится, потому что
# хвост терминала выглядит правдоподобно: в нём стоит спека.
#
# ПРИЗНАК — приветственный баннер в ХВОСТЕ. Баннер печатается один раз при
# старте. Если он всё ещё виден в последних сорока строках, агент не напечатал
# с тех пор НИЧЕГО, то есть не начинал. У работающего воркера баннер давно
# уехал за край. Лечится нажатием ввода: `terminal send --enter --text ""`.
echo
stalled=""
finished=""
if command -v orca >/dev/null 2>&1; then
  for h in $(orca orchestration worker-list --json 2>/dev/null | "$PY" -c "
import json,sys
try:
    for w in json.load(sys.stdin)['result']['workers']:
        if w.get('dispatchStatus') == 'dispatched':
            print(w['agentTerminalHandle'])
except Exception:
    pass
" 2>/dev/null); do
    tail40=$(orca terminal read --terminal "$h" --limit 40 2>/dev/null)
    # ПРИЗНАК ОДИН, и он проверен в обе стороны на одном воркере: у review-cut в
    # стойке баннер в хвосте был, после нажатия ввода — ноль совпадений, как и у
    # трёх других работающих. Страж умеет краснеть и умеет зеленеть.
    #
    # Второй признак я пробовал и выбросил: `latest cursor` терминала считает не
    # строки, а страницы, и считает ПО-РАЗНОМУ у провайдеров — у работающих
    # claude-воркеров он равен 1, у codex уходит в тысячи. Проверка по нему дала
    # четыре ложных срабатывания из четырёх. Широкий неверный страж хуже узкого
    # верного: он приучает не верить красному.
    #
    # Остаётся честно названная слепота: на codex признак НЕ ПРОВЕРЕН — его
    # баннер к моменту проверки уезжает из буфера («older output is no longer
    # retained»), а точный текст мы не записали ни в одном из двух случаев.
    # Значит codex-воркера по-прежнему проверяем глазами по первому кругу.
    # `MCP startup incomplete` и `Use /skills` — тот же баннер незапущенного
    # воркера, только codex доходит до него ПОСЛЕ отказа MCP-серверов (у нас
    # регулярно не встают blender и godot-ai, к игре не относящиеся). Ревью
    # день-лога простояло так целый круг: прибор молчал, потому что искал
    # только приветствие агента, а хвост кончался жалобой на MCP.
    # Тот же баннер стоит в хвосте и у ЗАКОНЧИВШЕГО воркера: сделав работу, он
    # возвращается к приглашению, и хвост опять кончается баннером. Ревью
    # день-лога так попало в список второй раз, уже сдав отчёт коммитом
    # `1d1ffca`. Различает не баннер, а РЕЗУЛЬТАТ: есть ли у ветки его дерева
    # коммиты впереди ствола. Поэтому ниже два разных вердикта, и лечения им
    # нужны противоположные — одному Enter, другому забрать работу.
    if printf '%s' "$tail40" | grep -qE 'Claude Code v[0-9]|Codex v[0-9]|Welcome to|MCP startup incomplete|Use /skills'; then
      # Различаем по СЛЕДАМ РАБОТЫ выше баннера, а не по дереву: привязки
      # терминала к worktree в Orca нет (`worktreeId` у всех — корень проекта).
      # У закончившего в хвосте лежат его собственные команды (`Ran ...`), у не
      # начавшего — только шум запуска MCP.
      if printf '%s' "$tail40" | grep -qE '(^|[^a-zA-Z])Ran [a-z]'; then
        finished="$finished $h"
      else
        stalled="$stalled $h"
      fi
    fi
  done
fi
if [ -n "$stalled" ]; then
  echo "ЗАПУЩЕНЫ И НЕ НАЧАТЫ — баннер в хвосте, коммитов нет: спека стоит в поле ввода"
  echo "  (если Enter не меняет хвост, спека НЕ ДОСТАВЛЕНА — отправляй саму инструкцию текстом)"
  for h in $stalled; do echo "  $h — лечить: orca terminal send --terminal $h --enter --text \"\""; done
  problems=$((problems + 1))
else
  echo "воркеров, запущенных и не начатых, нет"
fi
if [ -n "$finished" ]; then
  echo
  echo "ЗАКОНЧИЛИ И НЕ ОТЧИТАЛИСЬ — баннер в хвосте, но следы работы есть: работу забрать"
  for h in $finished; do echo "  $h — проверь ветку его дерева: коммит есть, письма нет"; done
  problems=$((problems + 1))
fi

# ── 8. Работа без исполнителя ────────────────────────────────────────────────
# Отказ, стоивший четырёх задач за раз: воркеры завершаются и освобождаются, а
# ветки с их работой остаются. Статус Orca при этом честен — воркера просто нет,
# — и заметить это можно только сравнив ВЕТКИ с живыми деревьями. 11 августа так
# осиротели тач-бюджет первого экрана, запас метки владельца, четыре MEDIUM
# интерфейса и посадка приёмки; одну из них я потом поставил заново на уже
# сделанное, потому что держал состояние в голове, а не в приборе.
#
# Ветка попадает сюда, если у неё есть свои коммиты поверх ствола и НИ ОДНО
# живое дерево на ней не стоит. Это не всегда плохо (работа может ждать посадки
# намеренно), поэтому раздел не считается проблемой — он перечисляет.
echo
# Признак «ветка в работе» берётся от ДЕРЕВЬЕВ, а не от Orca, и это исправление
# настоящей слепоты: в `worker-list` поле `resource.worktreeId` у всех воркеров
# указывает на КОРЕНЬ ПРОЕКТА, а не на переданное дерево. Значит live_branches
# читала HEAD главного дерева, то есть всегда `main`, и раздел никогда не
# различал исполнителей — он перечислял все ветки с несъехавшей работой, называясь
# при этом иначе. Ветка, выложенная в каком-либо worktree, — ветка в работе;
# это верно без Orca и не врёт в первые минуты после отправки, когда воркер
# ещё в `ready`, а прибор уже спрашивают.
# Живым считается дерево ИЗ РАБОЧЕЙ ОБЛАСТИ — каталог рабочих деревьев проекта
# (`$WORKTREES_DIR` из `.studio/project.conf`, по умолчанию `.worktrees`) или
# `orca/workspaces/` — либо главное дерево репозитория.
# Дерево в стороне — не работа, а парковка, и это не теория: HIGH тач-раскладки
# пролежал невидимым именно так — ветка была выложена в дерево, оставшееся от
# совсем другой задачи, и потому читалась как «в работе». Признак «есть дерево»
# без проверки, ГДЕ оно, прячет ровно тот класс потери, ради которого раздел и
# написан.
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
WORK_AREA="${WORKTREES_DIR:-.worktrees}"
export PROJECT_ROOT WORK_AREA
live_branches=" $(git worktree list --porcelain 2>/dev/null | "$PY" -c "
import os, sys
root = os.environ.get('PROJECT_ROOT', '')
area = os.environ.get('WORK_AREA', '.worktrees').strip('/')
def in_work_area(p):
    return '/orca/workspaces/' in p or f'/{area}/' in p or p == root
path = None
for line in sys.stdin:
    line = line.rstrip('\n')
    if line.startswith('worktree '):
        path = line[9:]
    elif line.startswith('branch refs/heads/'):
        if path and in_work_area(path):
            print(line[18:])
" | tr '\n' ' ') "
parked=$(git worktree list --porcelain 2>/dev/null | "$PY" -c "
import os, sys
root = os.environ.get('PROJECT_ROOT', '')
area = os.environ.get('WORK_AREA', '.worktrees').strip('/')
def in_work_area(p):
    return '/orca/workspaces/' in p or f'/{area}/' in p or p == root
path = None
for line in sys.stdin:
    line = line.rstrip('\n')
    if line.startswith('worktree '):
        path = line[9:]
    elif line.startswith('branch refs/heads/'):
        if path and not in_work_area(path):
            print(f'  {line[18:]} — дерево в стороне: {path}')
")
if [ -n "$parked" ]; then
  echo
  echo "ВЕТКИ В ЧУЖИХ ДЕРЕВЬЯХ — это парковка, а не работа:"
  echo "$parked"
  echo "  Такое дерево не доказывает исполнителя. Проверь по task-list и реши по каждой."
fi
# ИМЯ СТВОЛА — ИЗ ПРОФИЛЯ. Вшитый `main` стоил этому разделу всего смысла:
# 23.09.2026 он напечатал «РАБОТА БЕЗ ИСПОЛНИТЕЛЯ: dnd-app — 587 коммитов ждут
# стадии», потому что сравнивал ветки со СТАРЫМ `main`, а работа идёт в
# `dnd-app`. Прибор объявил бесхозной работой сам проект — и это второй раз за
# один день, когда он говорил уверенно о том, чего не мерил.
orphans=""
if [ "$trunk_ok" != 1 ]; then
  cannot "работу без исполнителя: ствол '$TRUNK' в репозитории не найден (TRUNK_BRANCH в .studio/project.conf)"
else
  for b in $(git for-each-ref --format='%(refname:short)' refs/heads | grep -v "^$TRUNK\$"); do
    ahead=$(git rev-list --count "$TRUNK..$b" 2>/dev/null || echo 0)
    [ "$ahead" -gt 0 ] || continue
    case " $live_branches " in *" $b "*) continue ;; esac
    orphans="$orphans $b:$ahead"
  done
  if [ -n "$orphans" ]; then
    echo "РАБОТА БЕЗ ИСПОЛНИТЕЛЯ — ветка с коммитами поверх ствола ($TRUNK), живого дерева на ней нет:"
    for o in $orphans; do echo "  ${o%%:*} — ${o##*:} коммитов ждут стадии"; done
    echo "  Это не всегда дефект: работа может ждать посадки. Но решение нужно по каждой."
  else
    echo "веток с работой без исполнителя нет (ствол: $TRUNK)"
  fi
fi

# ── Журнал: «периодически» без отметки времени превращается в «когда вспомню» ──
# Правило §14а говорит гонять прибор раз в ~2 часа, а не каждый круг. Проверить
# это можно только по записи: координатор между кругами теряет память, и «я же
# недавно смотрел» не факт. Последняя строка отвечает на вопрос «сколько прошло».
mkdir -p .studio
# ОДНО ИМЯ — ОДНА ВЕЛИЧИНА. На Windows в поле `load1` пришлось бы класть
# проценты занятости ядер, и журнал стал бы складывать в один столбец длину
# очереди с долей ядра. Поэтому у платформ разные ключи: чего не мерили — того
# в строке нет вовсе.
case "$PLATFORM" in
  windows)
    printf '{"at":"%s","platform":"windows","cpu_pct":%s,"problems":%d,"blind":%d}\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${load_pct:-null}" "$problems" "$blind" >> .studio/health.jsonl
    ;;
  *)
    printf '{"at":"%s","platform":"%s","load1":"%s","problems":%d,"blind":%d}\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PLATFORM" "$load1" "$problems" "$blind" >> .studio/health.jsonl
    ;;
esac

echo
if [ "$problems" -eq 0 ]; then
  echo "═══ вопросов нет ═══"
else
  echo "═══ вопросов: $problems — разобрать ДО того, как объяснять замедление машиной ═══"
fi
# СЛЕПОТА ПЕЧАТАЕТСЯ РЯДОМ С ВЕРДИКТОМ, А НЕ ТОЛЬКО ВНУТРИ РАЗДЕЛА. Читают
# последние строки; «вопросов нет» без этой приписки — ровно тот доклад, который
# 23.09.2026 ушёл владельцу как «чужих процессов не осталось».
if [ "$blind" -gt 0 ]; then
  echo "═══ НЕ ИЗМЕРЕНО разделов: $blind — это не «чисто», а слепота: ═══"
  echo "    пустой список значит «перебирать было нечего», а не «ничего нет»."
fi
# КОД ВЫХОДА ОДИН И ТОТ ЖЕ — 0 — и с находками, и без: прибор перечисляет, а
# решение принимает человек, и ни один вызывающий не гоняет его как ворота.
# Ненулевой код здесь ровно один и означает «прибор не запустился»: 2, когда не
# нашёлся работающий python (см. пробу интерпретатора в начале файла).
prev=$(tail -2 .studio/health.jsonl 2>/dev/null | head -1)
[ -n "$prev" ] && echo "предыдущий прогон: $prev"
exit 0
