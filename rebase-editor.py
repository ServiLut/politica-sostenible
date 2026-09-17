import sys

file_path = sys.argv[1]
with open(file_path, 'r') as f:
    lines = f.readlines()

with open(file_path, 'w') as f:
    for line in lines:
        if line.startswith('pick ') and '92c4fe0' in line:
            f.write(line.replace('pick ', 'edit '))
        else:
            f.write(line)
