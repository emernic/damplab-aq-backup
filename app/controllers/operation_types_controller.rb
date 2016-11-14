class OperationTypesController < ApplicationController

  before_filter :signed_in_user

  before_filter {
    unless current_user && current_user.is_admin
      redirect_to root_path, notice: "Administrative privileges required to access operation type definitions."
    end
  }

  def index

    respond_to do |format|
      format.json { render json: OperationType.all.as_json(methods: [:field_types, :protocol, :cost_model, :documentation]) }
      format.html { render layout: 'browser' }
    end    
    
  end

  def add_field_types ot, fts

    if fts
      fts.each do |ft|
        if ft[:allowable_field_types]
          sample_type_names = ft[:allowable_field_types].collect { |aft| 
            aft[:sample_type] ? aft[:sample_type][:name] : nil
          }
          container_names =  ft[:allowable_field_types]
            .select { |aft| aft[:object_type] && aft[:object_type][:name] && aft[:object_type][:name] != "" }
            .collect { |aft|            
              raise "Object type '#{aft[:object_type][:name]}' not definied by browser for #{ft[:name]}." unless ObjectType.find_by_name(aft[:object_type][:name])
              aft[:object_type][:name]
          }          
        else
          sample_type_names = []
          container_names = []
        end
        ot.add_io ft[:name], sample_type_names, container_names, ft[:role], array: ft[:array], part: ft[:part], routing: ft[:routing]
      end
    end

  end

  def create

    ot = OperationType.new(
      name: params[:name], category: params[:category], 
      deployed: params[:deployed], on_the_fly: params[:on_the_fly])

    ot.save
    add_field_types ot, params[:field_types]     

    ["protocol", "cost_model", "documentation"].each do |name|
      ot.new_code(name, params[name]["content"])
    end

    render json: ot.as_json(methods: [:field_types, :protocol, :cost_model, :documentation])

  end

  def destroy

    ot = OperationType.find(params[:id])

    if ot.operations.count != 0
      render json: { error: "Operation Type #{ot.name} has associated operations." }
    elsif ot.deployed
      render json: { error: "Operation Type #{ot.name} has been deployed." }
    else
      ot.destroy
      render json: { ok: true }
    end

  end

  def code

    ot = OperationType.find(params[:id])
    c = ot.code(params[:name])
    
    if c
      c = c.commit(params[:content])
    else
      c = ot.new_code(params[:name], params[:content])
    end

    render json: c

  end

  def update_from_ui data, update_fields=true

    ot = OperationType.find(data[:id])
    update_errors = []

    ActiveRecord::Base.transaction do

      ot.name = data[:name]
      ot.category = data[:category]
      ot.deployed = data[:deployed]
      ot.on_the_fly = data[:on_the_fly] 
      ot.save

      if !ot.errors.empty?
        update_errors += ot.errors.full_messages
        raise ActiveRecord::Rollback
      end

      if update_fields

        ot.field_types.each do |ft| 
          ft.destroy
        end

        begin
          add_field_types ot, data[:field_types]
        rescue Exception => e
          update_errors << e.to_s << e.backtrace.to_s
          raise ActiveRecord::Rollback
        end

      end

    end

    ot[:update_errors] = update_errors

    ot

  end

  def update
    ot = update_from_ui params
    if ot[:update_errors].empty?
      render json: ot.as_json(methods: [:field_types, :protocol, :cost_model, :documentation])
    else
      render json: { errors: ot.update_errors }     
    end
  end

  def default
    render json: { content: File.open("lib/tasks/default.rb", "r").read }
  end

  def random
    ops_json = []
    ActiveRecord::Base.transaction do
      ops = OperationType.find(params[:id]).random(params[:num].to_i)
      render json: ops.as_json(methods: :field_values)
      raise ActiveRecord::Rollback
    end
    
  end

  def make_test_ops ot, tops

    tops.collect do |test_op|

      op = ot.operations.create status: "ready", user_id: test_op[:user_id]

      (ot.inputs + ot.outputs).each do |io|

        if io.array
          fvs = test_op[:field_values].select { |fv| fv[:name] == io.name && fv[:role] == io.role }
          aft = AllowableFieldType.find_by_id(fvs[0][:allowable_field_type_id])
          samples = fvs.collect { |fv|
            Sample.find_by_id(fv[:child_sample_id])
          }
          actual_fvs = op.set_property(io.name, samples, io.role,true,aft)
          raise "Nil value Error: Could not set #{fvs}" unless actual_fvs
        else
          fv = test_op[:field_values].select { |fv| fv[:name] == io.name && fv[:role] == io.role }[0]
          aft = AllowableFieldType.find_by_id(fv[:allowable_field_type_id])
          actual_fv = op.set_property(fv[:name], Sample.find_by_id(fv[:child_sample_id]), fv[:role],true,aft)
          raise "Nil value Error: Could not set #{fv}" unless actual_fv
          unless actual_fv.errors.empty? 
            raise "Active Record Error: Could not set #{fv}: #{actual_fv.errors.full_messages.join(', ')}"
          end          
        end

      end

      op

    end

  end

  def test

    # save the operaton
    ot = update_from_ui params, false

    if !ot[:update_errors].empty? 
      render json: { errors: ot.update_errors }
      return
    end

    # start a transaction
    ActiveRecord::Base.transaction do

      # (re)build the operations
      ops = make_test_ops OperationType.find(params[:id]), params[:test_operations]

      # run the protocol
      job,newops = ot.schedule(ops, current_user, Group.find_by_name('technicians'))
      error = nil

      begin
        manager = Krill::Manager.new job.id, true, "master", "master"
      rescue Exception => e
        error = e
      end

      if error

        render json: {
          error: error.message,
          backtrace: error.backtrace
        }

      else

        begin

          ops.extend(Krill::OperationList)
          ops.make(role: 'input')

          ops.each do |op|
            op.set_status "running"
          end

          manager.run

          ops.each { |op| op.reload }

          # render the resulting data including the job and the operations
          render json: {
            operations: ops.as_json(methods: [:field_values,:associations]),
            job: job.reload
          }

        rescue Exception => e

          logger.error "Bug encountered while testing: " + e.message 

          e.backtrace.each do |b|
            logger.error b
          end

          render json: {
            error: "Bug encountered while testing: " + e.message + " at " + e.backtrace.first + ". ",
            backtrace: e.backtrace
          }          

        end

      end

      # rollback the transaction so test data is not added to the inventory
      raise ActiveRecord::Rollback

    end   

  end

  def export
    render json: OperationType.find(params[:id]).export
  end
 
  def import

    begin 
      ot = OperationType.import(params[:operation_type])
      ot.category = "Recent Imports"
      ot.deployed = false
      ot.save
      render json: { operation_type: ot.as_json(methods: [:field_types, :protocol, :cost_model, :documentation]) }
    rescue Exception => e
      render json: { error: "Could not import operation type: " + e.to_s }
    end

  end

  def copy

    begin
      ot = OperationType.find(params[:id]).copy
      render json: { operation_type: ot.as_json(methods: [:field_types, :protocol, :cost_model, :documentation]) }
    rescue Exception => e
      render json: { error: "Could not copy operation type: " + e.to_s }
    end

  end

end

