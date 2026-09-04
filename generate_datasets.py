import pandas as pd
import numpy as np
import random
import json
import uuid

# Set seed for reproducible validation
np.random.seed(42)
random.seed(42)
num_runs = 10000

print("Generating 10,000 execution runs across 150+ parameters...")

# 1. Base Configurations (Signal Parameters)
data = {
    'Run_ID': [f'RUN_{i:05d}' for i in range(num_runs)],
    'Config_ID': [f'CONFIG_{(i % 250) + 1:03d}' for i in range(num_runs)],
    'Cache_Policy': np.random.choice(['Adaptive', 'Fixed_LRU', 'Static_FIFO'], num_runs),
    'Scheduler': np.random.choice(['Dynamic', 'RoundRobin', 'Priority'], num_runs),
    'Feature_Flag_X': np.random.choice([True, False], num_runs, p=[0.40, 0.60]),
    'Compiler_Opt': np.random.choice(['-O0', '-O1', '-O2', '-O3'], num_runs),
    'Memory_Alloc': np.random.choice(['16GB', '32GB', '64GB'], num_runs),
    'Random_Seed_Group': np.random.choice(range(1, 9), num_runs),  # 8 seed groups (Group 8 triggers race condition)
    'Workload_Type': np.random.choice(['Read-Heavy', 'Write-Heavy', 'Mixed'], num_runs),
    'Traffic_Pattern': np.random.choice(['Burst', 'Sustained', 'Random'], num_runs)
}

# 2. Add 100 Configuration Noise Flags and 50 Randomized Environment Variables
# Satisfies the requirement: 100+ configuration parameters (5 base + 100 flags = 105)
# and 50+ randomized variables (3 base + 50 env vars = 53)
for i in range(1, 101):
    data[f'Config_Flag_{i}'] = np.random.choice([0, 1], num_runs)

for i in range(1, 51):
    data[f'Rand_Env_Var_{i}'] = np.random.normal(0, 1, num_runs).round(4)

df = pd.DataFrame(data)

# 3. Inject Ground Truth Failure Rules
# Base failure rate: ~2.1% (matching baseline safe runs like Configuration C42)
fail_prob = np.full(num_runs, 0.021)

# Rule 1: Feature Flag X strongly drives failures (~78% representation in failing runs)
fail_prob += np.where(df['Feature_Flag_X'], 0.48, 0.0)

# Rule 2: Random Seed Group 8 triggers an unhandled edge race condition (~35% representation in failing runs)
fail_prob += np.where(df['Random_Seed_Group'] == 8, 0.65, 0.0)

# Rule 3: 16GB Memory under Write-Heavy workloads causes heap pressure
fail_prob += np.where((df['Memory_Alloc'] == '16GB') & (df['Workload_Type'] == 'Write-Heavy'), 0.16, 0.0)

fail_prob = np.clip(fail_prob, 0.0, 1.0)
df['Outcome_Binary'] = np.random.binomial(1, fail_prob)
df['Status'] = np.where(df['Outcome_Binary'] == 1, 'FAIL', 'PASS')

# 4. Inject Performance Metrics
# Base execution time, throughput, and memory
base_time = np.random.normal(120.0, 12.0, num_runs)
base_throughput = np.random.normal(500.0, 40.0, num_runs)
base_peak_mem = np.random.normal(14.0, 2.0, num_runs)

# Rule 4: Cache Policy = Adaptive + Scheduler = Dynamic improves performance by 22%
perf_mask = (df['Cache_Policy'] == 'Adaptive') & (df['Scheduler'] == 'Dynamic')
base_time[perf_mask] *= 0.78        # 22% faster execution
base_throughput[perf_mask] *= 1.22  # 22% higher throughput

df['Execution_Time_sec'] = np.round(base_time, 2)
df['Throughput_MBps'] = np.round(base_throughput, 2)
df['Peak_Memory_GB'] = np.round(base_peak_mem, 2)

# Apply crash and timeout penalties to failing executions
crashed = df['Outcome_Binary'] == 1
df.loc[crashed, 'Execution_Time_sec'] = np.random.choice([14.2, 299.9], size=crashed.sum())
df.loc[crashed, 'Throughput_MBps'] = 0.0

# Memory saturation: high heap pressure on 16GB Write-Heavy crashes saturates peak memory near 16GB
mem_pressure = crashed & (df['Memory_Alloc'] == '16GB') & (df['Workload_Type'] == 'Write-Heavy')
df.loc[mem_pressure, 'Peak_Memory_GB'] = np.round(np.random.normal(15.85, 0.1, size=mem_pressure.sum()), 2)

# 5. Designate Configuration C42 Benchmark
# Index 42 represents an optimal baseline configuration with low failure probability (~2.1%)
df.loc[42, 'Run_ID'] = 'RUN_C0042'
df.loc[42, 'Config_ID'] = 'C42'
df.loc[42, 'Cache_Policy'] = 'Adaptive'
df.loc[42, 'Scheduler'] = 'Dynamic'
df.loc[42, 'Feature_Flag_X'] = False
df.loc[42, 'Memory_Alloc'] = '64GB'
df.loc[42, 'Random_Seed_Group'] = 3
df.loc[42, 'Outcome_Binary'] = 0
df.loc[42, 'Status'] = 'PASS'
df.loc[42, 'Execution_Time_sec'] = 93.6
df.loc[42, 'Throughput_MBps'] = 610.0

# Export master structured dataset
df.to_csv('execution_data_master.csv', index=False)
print("Saved execution_data_master.csv")

# Helper function to format timestamp as HH:MM:SS.mmm
def format_timestamp(seconds: float) -> str:
    m = int(seconds // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    if ms >= 1000:
        s += 1
        ms -= 1000
    return f"00:{m:02d}:{s:02d}.{ms:03d}"

# 6. Generate Unstructured JSONL Log Traces
print("Generating unstructured log traces in system_execution_logs.jsonl...")

records = df.to_dict(orient='records')
with open('system_execution_logs.jsonl', 'w') as f_log:
    for row in records:
        events = [
            {"timestamp": "00:00:01.102", "level": "INFO", "msg": f"Init subsystem: Memory={row['Memory_Alloc']}, Policy={row['Cache_Policy']}"},
            {"timestamp": "00:00:02.450", "level": "INFO", "msg": f"Workload spawned: {row['Workload_Type']}, Pattern={row['Traffic_Pattern']}"}
        ]
        
        if row['Status'] == 'FAIL':
            # Sequential diagnostic warnings
            if (row['Memory_Alloc'] == '16GB') and (row['Workload_Type'] == 'Write-Heavy'):
                events.append({"timestamp": "00:00:04.180", "level": "WARN", "msg": "High heap memory pressure detected on 16GB allocation under Write-Heavy load."})
            if row['Random_Seed_Group'] == 8:
                events.append({"timestamp": "00:00:05.120", "level": "WARN", "msg": "Entropy anomaly detected in Random Seed Group 8."})
            if row['Feature_Flag_X']:
                events.append({"timestamp": "00:00:07.890", "level": "WARN", "msg": "Experimental branch invoked via Feature_Flag_X."})
                
            # Deterministic error mapping to enable Root Cause Intelligence (Q5 & Q6)
            if row['Execution_Time_sec'] >= 299.0:
                err = "ERR_TIMEOUT"
            elif (row['Memory_Alloc'] == '16GB') and (row['Workload_Type'] == 'Write-Heavy'):
                err = "ERR_MEM_OVERFLOW"
            elif row['Random_Seed_Group'] == 8:
                err = "ERR_SEED_MISMATCH"
            else:
                err = "ERR_SEGFAULT_0x4A"
                
            events.append({
                "timestamp": format_timestamp(row['Execution_Time_sec']),
                "level": "FATAL",
                "msg": f"Execution aborted: {err} at address 0x{uuid.uuid4().hex[:8].upper()}"
            })
        else:
            events.append({
                "timestamp": format_timestamp(row['Execution_Time_sec']),
                "level": "INFO",
                "msg": f"Execution completed normally in {row['Execution_Time_sec']}s. Telemetry flushed."
            })
            
        record = {
            "run_id": row['Run_ID'],
            "config_id": row['Config_ID'],
            "status": row['Status'],
            "execution_time": row['Execution_Time_sec'],
            "events": events
        }
        f_log.write(json.dumps(record) + '\n')

print("Saved system_execution_logs.jsonl")

# 7. Verification Summary
failing_runs = df[df['Status'] == 'FAIL']
flag_x_pct = (failing_runs['Feature_Flag_X'].sum() / len(failing_runs)) * 100
seed_8_pct = ((failing_runs['Random_Seed_Group'] == 8).sum() / len(failing_runs)) * 100

passing_runs = df[df['Status'] == 'PASS']
opt_mask = (passing_runs['Cache_Policy'] == 'Adaptive') & (passing_runs['Scheduler'] == 'Dynamic')
perf_time_gain = (1 - passing_runs.loc[opt_mask, 'Execution_Time_sec'].mean() / passing_runs.loc[~opt_mask, 'Execution_Time_sec'].mean()) * 100
perf_thru_gain = (passing_runs.loc[opt_mask, 'Throughput_MBps'].mean() / passing_runs.loc[~opt_mask, 'Throughput_MBps'].mean() - 1) * 100

print("\n--- DATASET VERIFICATION ---")
print(f"Total Runs: {len(df):,}")
print(f"Total Columns: {df.shape[1]}")
print(f"Overall Failure Rate: {(len(failing_runs) / len(df)) * 100:.1f}%")
print(f"Feature Flag X in Failures: {flag_x_pct:.1f}% (Expected ~78%)")
print(f"Seed Group 8 in Failures: {seed_8_pct:.1f}% (Expected ~35%)")
print(f"Adaptive + Dynamic Speedup: {perf_time_gain:.1f}% faster, {perf_thru_gain:.1f}% higher throughput (Expected ~22%)")
